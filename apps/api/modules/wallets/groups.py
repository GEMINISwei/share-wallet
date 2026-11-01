"""錢包群組: 每個人自己的分組、排序與顯示 (見 docs/features/wallets.md〈錢包群組〉)。

群組只屬於自己, 所以這裡的授權只有一條: 群組是不是自己的。別人的群組一律當作不存在。
只有一般錢包分群組; 旅遊錢包只有顯示。
"""

from typing import Literal

from sqlalchemy.exc import IntegrityError

from shared.auth.contracts import CurrentUser
from shared.db.table import is_unique_violation
from shared.http.errors import LangException

from .access import open_wallet
from .errors import WalletError
from .model import GroupDetail, WalletGroupTable, WalletKind, WalletMemberTable, WalletTable
from .schema import (
    VisibilityUpdate,
    WalletGroupCreate,
    WalletGroupInfo,
    WalletGroupList,
    WalletGroupMove,
    WalletGroupOperate,
    WalletGroupRename,
    WalletGroupUpdate,
    WalletOperate,
)

# 含預設群組。上限是為了讓選群組的面板與設定頁不會無限變長, 不是資料庫的限制。
MAX_GROUPS = 20


async def _locked_groups(user_id: str) -> list[GroupDetail]:
    await WalletGroupTable.ensure_default(user_id)
    return await WalletGroupTable.list_for_user(user_id, lock=True)


def _own_group(groups: list[GroupDetail], id: str) -> GroupDetail:
    for group in groups:
        if group["id"] == id:
            return group
    raise LangException(404, WalletError.GROUP_NOT_FOUND)


async def _renumber(ordered: list[GroupDetail | str]) -> None:
    """依清單的順序寫回位置。每次都整批重編, 位置才不會因為刪除或交換留下空洞與重複。"""
    await WalletGroupTable.set_positions(
        {item if isinstance(item, str) else item["id"]: index for index, item in enumerate(ordered)}
    )


async def list_groups(current_user: CurrentUser) -> WalletGroupList:
    user_id = current_user["id"]
    await WalletGroupTable.ensure_default(user_id)
    groups = await WalletGroupTable.list_for_user(user_id)
    joined = await WalletTable.find_joined(user_id)
    items = []
    for group in groups:
        wallets = [item for item in joined if item["group_id"] == group["id"]]
        visible = [item for item in wallets if not item["is_hidden"]]
        items.append(
            WalletGroupInfo(
                id=group["id"],
                name=group["name"],
                is_default=group["is_default"],
                wallet_count=len(wallets),
                visible_count=len(visible),
                total_balance=sum(item["wallet"]["balance"] for item in visible),
            )
        )
    return WalletGroupList(list_data=items, count=len(items))


async def _ensure_name_free(user_id: str, name: str, exclude_id: str | None = None) -> None:
    if await WalletGroupTable.name_taken(user_id, name, exclude_id=exclude_id):
        raise LangException(409, WalletError.GROUP_NAME_EXISTS)


async def create_group(
    form_data: WalletGroupCreate, current_user: CurrentUser
) -> WalletGroupOperate:
    """新的群組排在預設群組前面: 「未分組」放在自己分好的群組後面比較自然。"""
    user_id = current_user["id"]
    groups = await _locked_groups(user_id)
    if len(groups) >= MAX_GROUPS:
        raise LangException(409, WalletError.GROUP_LIMIT)
    await _ensure_name_free(user_id, form_data.name)
    try:
        created = await WalletGroupTable.create(
            data={"user_id": user_id, "name": form_data.name, "position": len(groups)}
        )
    except IntegrityError as exc:
        if not is_unique_violation(exc):
            raise
        raise LangException(409, WalletError.GROUP_NAME_EXISTS) from exc

    default_index = next(index for index, group in enumerate(groups) if group["is_default"])
    ordered: list[GroupDetail | str] = [*groups]
    ordered.insert(default_index, created["id"])
    await _renumber(ordered)
    return WalletGroupOperate(id=created["id"])


async def rename_group(
    id: str, form_data: WalletGroupRename, current_user: CurrentUser
) -> WalletGroupOperate:
    user_id = current_user["id"]
    group = _own_group(await _locked_groups(user_id), id)
    if group["is_default"]:
        raise LangException(400, WalletError.DEFAULT_GROUP_FIXED)
    await _ensure_name_free(user_id, form_data.name, exclude_id=id)
    try:
        await WalletGroupTable.update_by_id(id=id, data={"name": form_data.name})
    except IntegrityError as exc:
        if not is_unique_violation(exc):
            raise
        raise LangException(409, WalletError.GROUP_NAME_EXISTS) from exc
    return WalletGroupOperate(id=id)


async def delete_group(id: str, current_user: CurrentUser) -> WalletGroupOperate:
    """裡面的錢包移回預設群組, 不會因為刪了群組而找不到錢包。"""
    groups = await _locked_groups(current_user["id"])
    group = _own_group(groups, id)
    if group["is_default"]:
        raise LangException(400, WalletError.DEFAULT_GROUP_FIXED)
    default = next(item for item in groups if item["is_default"])
    await WalletMemberTable.move_group(id, default["id"])
    await WalletGroupTable.remove(id)
    await _renumber([item for item in groups if item["id"] != id])
    return WalletGroupOperate(id=id)


async def move_group(
    id: str, form_data: WalletGroupMove, current_user: CurrentUser
) -> WalletGroupOperate:
    groups = await _locked_groups(current_user["id"])
    group = _own_group(groups, id)
    index = groups.index(group)
    step: Literal[-1, 1] = -1 if form_data.direction == "up" else 1
    target = index + step
    if 0 <= target < len(groups):
        groups[index], groups[target] = groups[target], groups[index]
        await _renumber([*groups])
    return WalletGroupOperate(id=id)


async def _ensure_member(wallet_id: str, current_user: CurrentUser) -> WalletKind:
    """群組與顯示記在自己的成員紀錄上, 沒加入的超級管理者沒有可以改的地方。"""
    access = await open_wallet(wallet_id, current_user)
    if access.role is None:
        raise LangException(403, WalletError.PLACEMENT_NOT_MEMBER)
    return WalletKind(access.wallet["kind"])


async def set_wallet_group(
    wallet_id: str, form_data: WalletGroupUpdate, current_user: CurrentUser
) -> WalletOperate:
    kind = await _ensure_member(wallet_id, current_user)
    if kind is WalletKind.TRAVEL:
        raise LangException(400, WalletError.TRAVEL_NOT_GROUPED)
    user_id = current_user["id"]
    # 鎖住: 同時刪除這個群組時, 刪除要等這裡放好錢包, 才不會把錢包留在被刪掉的群組。
    group = _own_group(await _locked_groups(user_id), form_data.group_id)
    await WalletMemberTable.set_group(wallet_id, user_id, group["id"])
    return WalletOperate(id=wallet_id)


async def set_wallet_visibility(
    wallet_id: str, form_data: VisibilityUpdate, current_user: CurrentUser
) -> WalletOperate:
    await _ensure_member(wallet_id, current_user)
    await WalletMemberTable.set_hidden(wallet_id, current_user["id"], form_data.is_hidden)
    return WalletOperate(id=wallet_id)
