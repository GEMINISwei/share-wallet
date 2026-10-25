"""錢包本身: 建立、列表、查看、修改設定、刪除。成員在 `members.py`, 分類在 `categories.py`。"""

from typing import Any

from shared.auth.contracts import CurrentUser
from shared.http.errors import LangException, ensure_found

from .access import can_manage, manage_wallet, open_wallet
from .categories import default_categories
from .errors import WalletError
from .model import (
    MemberRole,
    WalletCategoryTable,
    WalletDetail,
    WalletKind,
    WalletMemberTable,
    WalletStatus,
    WalletTable,
)
from .schema import (
    FavoriteUpdate,
    GeneralWalletCreate,
    TravelWalletCreate,
    TravelWalletUpdate,
    WalletInfo,
    WalletList,
    WalletOperate,
    WalletUpdate,
)


async def create_wallet(
    form_data: GeneralWalletCreate | TravelWalletCreate, current_user: CurrentUser
) -> WalletOperate:
    """建立者是唯一的管理者。"""
    return await create_wallet_with_admin(form_data, current_user["id"])


async def create_wallet_with_admin(
    form_data: GeneralWalletCreate | TravelWalletCreate, admin_user_id: str
) -> WalletOperate:
    """`admin_user_id` 是唯一的成員兼管理者。一般錢包依請求的語系附上預設分類。"""
    # 逐欄列出而不是 `**model_dump()`, 理由見 modules/roles/service.py 的 create_role。
    data: dict[str, Any] = {"kind": form_data.kind, "name": form_data.name}
    if isinstance(form_data, GeneralWalletCreate):
        data["balance"] = form_data.initial_balance
    else:
        data |= {
            "destination": form_data.destination,
            "start_date": form_data.start_date,
            "end_date": form_data.end_date,
        }

    # 不另外包 `transaction()`: 這三個寫入都在同一個請求裡, 任何一步丟出例外時
    # middleware 會整批回滾。
    created = await WalletTable.create(data=data)
    await WalletMemberTable.create(
        data={"wallet_id": created["id"], "user_id": admin_user_id, "role": MemberRole.ADMIN}
    )
    if form_data.kind is WalletKind.GENERAL:
        await WalletCategoryTable.create_many(created["id"], default_categories())
    return WalletOperate(id=created["id"])


def _to_info(
    wallet: WalletDetail, role: MemberRole | None, manageable: bool, favorite: bool
) -> WalletInfo:
    is_general = wallet["kind"] == WalletKind.GENERAL
    return WalletInfo(
        id=wallet["id"],
        kind=WalletKind(wallet["kind"]),
        name=wallet["name"],
        status=WalletStatus(wallet["status"]),
        balance=wallet["balance"] if is_general else None,
        destination=wallet["destination"],
        start_date=wallet["start_date"],
        end_date=wallet["end_date"],
        created_at=wallet["created_at"],
        my_role=role,
        can_manage=manageable,
        is_favorite=favorite,
    )


async def list_wallets(current_user: CurrentUser) -> WalletList:
    """只列自己加入的錢包, 超級管理者也一樣 (所有錢包在後台看)。

    最愛的在前, 已結帳的不論是不是最愛都排在最後 (見 docs/features.md〈錢包列表〉)。
    """
    joined = await WalletTable.find_joined(current_user["id"])
    infos = [
        _to_info(
            item["wallet"],
            item["role"],
            can_manage(item["role"], current_user),
            item["is_favorite"],
        )
        for item in joined
    ]
    # sorted 是穩定的: 其他的維持加入的先後。
    wallets = sorted(
        infos,
        key=lambda wallet: (wallet.status is WalletStatus.SETTLED, not wallet.is_favorite),
    )
    total = sum(wallet.balance or 0 for wallet in wallets if wallet.kind is WalletKind.GENERAL)
    return WalletList(list_data=wallets, count=len(wallets), total_balance=total)


async def get_wallet(id: str, current_user: CurrentUser) -> WalletInfo:
    access = await open_wallet(id, current_user)
    favorite = await WalletMemberTable.find_favorite(id, current_user["id"])
    return _to_info(access.wallet, access.role, access.can_manage, favorite)


async def set_favorite(
    id: str, form_data: FavoriteUpdate, current_user: CurrentUser
) -> WalletOperate:
    """最愛記在自己的成員紀錄上, 所以沒加入的超級管理者不能設。已結帳的錢包也可以設。"""
    access = await open_wallet(id, current_user)
    if access.role is None:
        raise LangException(403, WalletError.FAVORITE_NOT_MEMBER)
    await WalletMemberTable.set_favorite(id, current_user["id"], form_data.is_favorite)
    return WalletOperate(id=id)


async def update_wallet(
    id: str, form_data: WalletUpdate, current_user: CurrentUser
) -> WalletOperate:
    access = await manage_wallet(id, current_user)
    # 類型決定了錢包有哪些資料 (餘額或起訖日), 換類型等於換一個錢包。
    if form_data.kind != access.wallet["kind"]:
        raise LangException(400, WalletError.KIND_MISMATCH)
    # 結算中可以改 (名稱與日期不影響金額), 已結帳的只能查看 (見 docs/features.md〈封存〉)。
    if await WalletTable.lock_status(id) is WalletStatus.SETTLED:
        raise LangException(409, WalletError.WALLET_ARCHIVED)

    data: dict[str, Any] = {"name": form_data.name}
    if isinstance(form_data, TravelWalletUpdate):
        data |= {
            "destination": form_data.destination,
            "start_date": form_data.start_date,
            "end_date": form_data.end_date,
        }
    updated = await WalletTable.update_by_id(id=id, data=data)
    return WalletOperate(id=ensure_found(updated, WalletError.NOT_FOUND)["id"])


async def delete_wallet(id: str, current_user: CurrentUser) -> WalletOperate:
    """永久刪除, 不論餘額 (見 docs/features.md〈刪除錢包〉)。"""
    await manage_wallet(id, current_user)
    if not await WalletTable.delete_by_id(id):
        raise LangException(404, WalletError.NOT_FOUND)
    return WalletOperate(id=id)
