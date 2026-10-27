"""誰能對一個錢包做什麼。

錢包的授權不看全站權限 (見 docs/features/members.md〈不設全站權限〉), 看的是錢包成員紀錄上的角色;
唯一的例外是超級管理者, 對任何錢包都等同管理者。所有端點都經過這裡, 規則只有這一份。
"""

from dataclasses import dataclass

from shared.auth.contracts import CurrentUser
from shared.auth.permissions import WILDCARD
from shared.http.errors import LangException, ensure_found

from .errors import WalletError
from .model import MemberRole, WalletDetail, WalletMemberTable, WalletTable


@dataclass(frozen=True)
class WalletAccess:
    wallet: WalletDetail
    #: 沒有加入 (超級管理者) 時是 None。
    role: MemberRole | None
    can_manage: bool


def is_super_admin(user: CurrentUser) -> bool:
    return WILDCARD in user["permissions"]


def can_manage(role: MemberRole | None, user: CurrentUser) -> bool:
    return role is MemberRole.ADMIN or is_super_admin(user)


async def open_wallet(wallet_id: str, user: CurrentUser) -> WalletAccess:
    """成員 (或超級管理者) 才打得開, 其他人一律是「錢包不存在」。"""
    wallet = ensure_found(await WalletTable.find_detail_by_id(wallet_id), WalletError.NOT_FOUND)
    role = await WalletMemberTable.find_role(wallet_id, user["id"])
    if role is None and not is_super_admin(user):
        raise LangException(404, WalletError.NOT_FOUND)
    return WalletAccess(wallet=wallet, role=role, can_manage=can_manage(role, user))


async def manage_wallet(wallet_id: str, user: CurrentUser) -> WalletAccess:
    """管理者 (或超級管理者) 才能做的操作。不是成員的人仍然先得到 404, 不是 403。"""
    access = await open_wallet(wallet_id, user)
    if not access.can_manage:
        raise LangException(403, WalletError.NOT_ADMIN)
    return access
