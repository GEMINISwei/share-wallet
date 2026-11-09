"""給其他後端 module 使用的公開介面。

只轉出能力 (函式與它的回傳型別), 不轉出 `UserTable`: 規則見 docs/architecture.md
〈模組之間的資料關聯〉。
"""

from .model import find_nicknames, is_active_user
from .superuser import create_super_admin, revoke_all_sessions

__all__ = ["create_super_admin", "find_nicknames", "is_active_user", "revoke_all_sessions"]
