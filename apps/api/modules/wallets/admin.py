"""後台 (超級管理者) 才有的操作: 列出所有錢包、替指定的使用者建立錢包。

查看、修改、刪除、成員與分類沿用一般的錢包端點: `access.py` 已讓超級管理者對任何錢包
等同管理者, 規則只留一份。這裡只放一般端點做不到的兩件事 —— 一般列表只列自己加入的,
一般建立的管理者固定是建立者。
"""

from typing import Literal, cast

from modules.users.public import find_nicknames, is_active_user
from shared.http.errors import LangException

from .errors import WalletError
from .model import (
    MemberDetail,
    MemberRole,
    WalletDetail,
    WalletKind,
    WalletMemberTable,
    WalletStatus,
    WalletTable,
)
from .schema import (
    AdminGeneralWalletCreate,
    AdminTravelWalletCreate,
    AdminWalletInfo,
    AdminWalletList,
    WalletAdmin,
    WalletOperate,
)
from .service import create_wallet_with_admin


async def create_wallet_for(
    form_data: AdminGeneralWalletCreate | AdminTravelWalletCreate,
) -> WalletOperate:
    """指定的使用者是唯一的管理者; 超級管理者不是自己指定的就不成為成員。"""
    # 停用的帳號登入不了, 讓他當唯一的管理者等於做出一個沒人能管理的錢包。
    if not await is_active_user(form_data.admin_user_id):
        raise LangException(400, WalletError.ADMIN_USER_INVALID)
    return await create_wallet_with_admin(form_data, form_data.admin_user_id)


def _to_admin_info(
    wallet: WalletDetail, members: list[MemberDetail], nicknames: dict[str, str]
) -> AdminWalletInfo:
    admins = [member["user_id"] for member in members if member["role"] is MemberRole.ADMIN]
    return AdminWalletInfo(
        id=wallet["id"],
        kind=WalletKind(wallet["kind"]),
        name=wallet["name"],
        status=WalletStatus(wallet["status"]),
        balance=wallet["balance"] if wallet["kind"] == WalletKind.GENERAL else None,
        destination=wallet["destination"],
        start_date=wallet["start_date"],
        end_date=wallet["end_date"],
        created_at=wallet["created_at"],
        member_count=len(members),
        admins=[WalletAdmin(user_id=uid, nickname=nicknames.get(uid, "")) for uid in admins],
    )


async def list_all_wallets(
    limit: int,
    cursor: str | None = None,
    direction: Literal["next", "prev"] = "next",
    name: str | None = None,
    kind: WalletKind | None = None,
) -> AdminWalletList:
    page = await WalletTable.find_page(
        limit=limit, cursor=cursor, direction=direction, name=name, kind=kind
    )
    wallets = cast(list[WalletDetail], page["list_data"])
    members = await WalletMemberTable.list_by_wallets([wallet["id"] for wallet in wallets])
    admin_ids = [
        member["user_id"]
        for wallet_members in members.values()
        for member in wallet_members
        if member["role"] is MemberRole.ADMIN
    ]
    nicknames = await find_nicknames(admin_ids)
    items = [_to_admin_info(wallet, members[wallet["id"]], nicknames) for wallet in wallets]
    return AdminWalletList.model_validate({**page, "list_data": items})
