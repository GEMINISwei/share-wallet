"""邀請連結: 管理者產生、查看、撤銷; 拿到連結的人預覽錢包、確認加入。

規則見 docs/features.md〈邀請連結〉〈加入流程〉。過期的連結仍留在資料表裡, 直到被重新產生、
撤銷或錢包刪除; 讀取時一律依「現在」判斷, 過期的就當作沒有。
"""

import secrets
from datetime import timedelta

from shared.auth.contracts import CurrentUser
from shared.http.errors import LangException
from shared.time import utc_now

from .access import manage_wallet
from .errors import WalletError
from .model import InviteDetail, MemberRole, WalletInviteTable, WalletMemberTable, WalletTable
from .schema import InviteInfo, InvitePreview, InviteState, WalletOperate

INVITE_LIFETIME = timedelta(days=1)


def _is_active(invite: InviteDetail | None) -> bool:
    return invite is not None and invite["expires_at"] > utc_now()


def _to_info(invite: InviteDetail) -> InviteInfo:
    return InviteInfo(token=invite["token"], expires_at=invite["expires_at"])


async def get_invite(wallet_id: str, current_user: CurrentUser) -> InviteState:
    """只有管理者看得到連結, 一般成員也不行 (見 docs/features.md〈邀請連結〉)。"""
    await manage_wallet(wallet_id, current_user)
    invite = await WalletInviteTable.find_detail_by_wallet(wallet_id)
    return InviteState(invite=_to_info(invite) if invite and _is_active(invite) else None)


async def create_invite(wallet_id: str, current_user: CurrentUser) -> InviteInfo:
    """產生或重新產生, 舊的連結立即失效。"""
    await manage_wallet(wallet_id, current_user)
    # 32 bytes 的亂數: 連結本身就是加入的憑證, 不能被猜到或逐一嘗試。
    token = secrets.token_urlsafe(32)
    expires_at = utc_now() + INVITE_LIFETIME
    await WalletInviteTable.replace(wallet_id, token, expires_at)
    return InviteInfo(token=token, expires_at=expires_at)


async def revoke_invite(wallet_id: str, current_user: CurrentUser) -> WalletOperate:
    """沒有連結時也算成功: 結果一樣是「沒有有效的連結」。"""
    await manage_wallet(wallet_id, current_user)
    await WalletInviteTable.remove(wallet_id)
    return WalletOperate(id=wallet_id)


async def _active_invite(token: str) -> InviteDetail:
    invite = await WalletInviteTable.find_detail_by_token(token)
    if invite is None or not _is_active(invite):
        raise LangException(404, WalletError.INVITE_INVALID)
    return invite


async def preview_invite(token: str, current_user: CurrentUser) -> InvitePreview:
    invite = await _active_invite(token)
    wallet = await WalletTable.find_detail_by_id(invite["wallet_id"])
    if wallet is None:
        raise LangException(404, WalletError.INVITE_INVALID)
    members = await WalletMemberTable.list_members(invite["wallet_id"])
    return InvitePreview(
        wallet_id=wallet["id"],
        kind=wallet["kind"],
        name=wallet["name"],
        destination=wallet["destination"],
        start_date=wallet["start_date"],
        end_date=wallet["end_date"],
        member_count=len(members),
        is_member=any(member["user_id"] == current_user["id"] for member in members),
    )


async def accept_invite(token: str, current_user: CurrentUser) -> WalletOperate:
    """加入的人是成員; 已經是成員 (含管理者) 時角色不變。"""
    wallet_id = (await _active_invite(token))["wallet_id"]
    await WalletMemberTable.add_if_absent(wallet_id, current_user["id"], MemberRole.MEMBER)
    return WalletOperate(id=wallet_id)
