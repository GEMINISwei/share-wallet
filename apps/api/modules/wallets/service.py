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
    WalletTable,
)
from .schema import (
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
    """建立者是唯一的管理者。一般錢包依請求的語系附上預設分類。"""
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
        data={"wallet_id": created["id"], "user_id": current_user["id"], "role": MemberRole.ADMIN}
    )
    if form_data.kind is WalletKind.GENERAL:
        await WalletCategoryTable.create_many(created["id"], default_categories())
    return WalletOperate(id=created["id"])


def _to_info(wallet: WalletDetail, role: MemberRole | None, manageable: bool) -> WalletInfo:
    is_general = wallet["kind"] == WalletKind.GENERAL
    return WalletInfo(
        id=wallet["id"],
        kind=WalletKind(wallet["kind"]),
        name=wallet["name"],
        balance=wallet["balance"] if is_general else None,
        destination=wallet["destination"],
        start_date=wallet["start_date"],
        end_date=wallet["end_date"],
        created_at=wallet["created_at"],
        my_role=role,
        can_manage=manageable,
    )


async def list_wallets(current_user: CurrentUser) -> WalletList:
    """只列自己加入的錢包, 超級管理者也一樣 (所有錢包在後台看)。"""
    joined = await WalletTable.find_joined(current_user["id"])
    wallets = [
        _to_info(item["wallet"], item["role"], can_manage(item["role"], current_user))
        for item in joined
    ]
    total = sum(wallet.balance or 0 for wallet in wallets if wallet.kind is WalletKind.GENERAL)
    return WalletList(list_data=wallets, count=len(wallets), total_balance=total)


async def get_wallet(id: str, current_user: CurrentUser) -> WalletInfo:
    access = await open_wallet(id, current_user)
    return _to_info(access.wallet, access.role, access.can_manage)


async def update_wallet(
    id: str, form_data: WalletUpdate, current_user: CurrentUser
) -> WalletOperate:
    access = await manage_wallet(id, current_user)
    # 類型決定了錢包有哪些資料 (餘額或起訖日), 換類型等於換一個錢包。
    if form_data.kind != access.wallet["kind"]:
        raise LangException(400, WalletError.KIND_MISMATCH)

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
