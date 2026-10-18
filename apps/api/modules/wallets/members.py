"""錢包成員: 列出、升降管理者、移除與離開。

「至少一位管理者」是先數再改, 所以每個會減少管理者的操作都先鎖住錢包那一列
(見 `WalletTable.lock_by_id`)。
"""

from modules.users.public import find_nicknames
from shared.auth.contracts import CurrentUser
from shared.http.errors import LangException

from .access import manage_wallet, open_wallet
from .errors import WalletError
from .model import MemberRole, WalletMemberTable, WalletTable
from .schema import MemberInfo, MemberList, MemberOperate, MemberRoleUpdate


async def list_members(wallet_id: str, current_user: CurrentUser) -> MemberList:
    await open_wallet(wallet_id, current_user)
    members = await WalletMemberTable.list_members(wallet_id)
    nicknames = await find_nicknames([member["user_id"] for member in members])
    items = [
        MemberInfo(
            user_id=member["user_id"],
            nickname=nicknames.get(member["user_id"], ""),
            role=member["role"],
        )
        for member in members
    ]
    return MemberList(list_data=items, count=len(items))


async def _locked_member_role(wallet_id: str, user_id: str) -> MemberRole:
    await WalletTable.lock_by_id(wallet_id)
    role = await WalletMemberTable.find_role(wallet_id, user_id)
    if role is None:
        raise LangException(404, WalletError.MEMBER_NOT_FOUND)
    return role


async def _ensure_not_last_admin(wallet_id: str, role: MemberRole) -> None:
    if role is MemberRole.ADMIN and await WalletMemberTable.count_admins(wallet_id) <= 1:
        raise LangException(409, WalletError.LAST_ADMIN)


async def update_member_role(
    wallet_id: str, user_id: str, form_data: MemberRoleUpdate, current_user: CurrentUser
) -> MemberOperate:
    """管理者可以升降任何人, 包括自己; 最後一位管理者不能被降為成員。"""
    await manage_wallet(wallet_id, current_user)
    role = await _locked_member_role(wallet_id, user_id)
    if form_data.role is MemberRole.MEMBER:
        await _ensure_not_last_admin(wallet_id, role)
    await WalletMemberTable.set_role(wallet_id, user_id, form_data.role)
    return MemberOperate(user_id=user_id)


async def remove_member(wallet_id: str, user_id: str, current_user: CurrentUser) -> MemberOperate:
    """移除自己就是離開, 每個成員都可以; 移除別人要是管理者。

    只刪成員紀錄 (見 docs/features.md〈離開與移除〉)。最後一位管理者不能離開也不能被移除。
    """
    access = await open_wallet(wallet_id, current_user)
    if user_id != current_user["id"] and not access.can_manage:
        raise LangException(403, WalletError.NOT_ADMIN)
    role = await _locked_member_role(wallet_id, user_id)
    await _ensure_not_last_admin(wallet_id, role)
    await WalletMemberTable.remove(wallet_id, user_id)
    return MemberOperate(user_id=user_id)
