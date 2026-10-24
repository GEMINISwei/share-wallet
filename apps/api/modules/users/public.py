"""給其他後端 module 使用的公開介面。"""

from .bootstrap import create_super_admin, revoke_all_sessions
from .model import UserTable


async def find_nicknames(user_ids: list[str]) -> dict[str, str]:
    """使用者 id → 暱稱。找不到的 id 不在結果裡。"""
    return await UserTable.find_nicknames_by_ids(user_ids)


async def is_active_user(user_id: str) -> bool:
    """這個 id 是存在而且沒有停用的使用者。"""
    return await UserTable.is_active(user_id)


__all__ = ["create_super_admin", "find_nicknames", "is_active_user", "revoke_all_sessions"]
