"""給其他後端 module 使用的公開介面。"""

from .bootstrap import create_super_admin
from .model import UserTable


async def find_nicknames(user_ids: list[str]) -> dict[str, str]:
    """使用者 id → 暱稱。找不到的 id 不在結果裡。"""
    return await UserTable.find_nicknames_by_ids(user_ids)


__all__ = ["create_super_admin", "find_nicknames"]
