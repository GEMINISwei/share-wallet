"""帳目的異動紀錄: 一筆帳的歷史、整個錢包的紀錄。寫入在 `ledger.py`。

所有成員都看得到 (見 docs/features.md〈紀錄〉), 所以只檢查打不打得開錢包。
"""

from modules.users.public import find_nicknames
from shared.auth.contracts import CurrentUser
from shared.http.errors import LangException

from .errors import WalletError
from .ledger import open_general_wallet
from .model import EntryLogDetail, WalletEntryLogTable
from .schema import EntryLogInfo, EntryLogList, EntryLogPage, EntrySnapshot, EntryUser


async def _to_infos(logs: list[EntryLogDetail]) -> list[EntryLogInfo]:
    nicknames = await find_nicknames(list({log["actor_id"] for log in logs}))
    return [
        EntryLogInfo(
            id=log["id"],
            entry_id=log["entry_id"],
            action=log["action"],
            actor=EntryUser(user_id=log["actor_id"], nickname=nicknames.get(log["actor_id"], "")),
            as_super_admin=log["as_super_admin"],
            before=None if log["before"] is None else EntrySnapshot.model_validate(log["before"]),
            after=None if log["after"] is None else EntrySnapshot.model_validate(log["after"]),
            created_at=log["created_at"],
        )
        for log in logs
    ]


async def list_entry_logs(wallet_id: str, entry_id: str, current_user: CurrentUser) -> EntryLogList:
    """含已刪除的帳: 每筆帳都有一筆「新增」, 一筆都沒有就是這個錢包沒有這筆帳。"""
    await open_general_wallet(wallet_id, current_user)
    logs = await WalletEntryLogTable.list_for_entry(wallet_id, entry_id)
    if not logs:
        raise LangException(404, WalletError.ENTRY_NOT_FOUND)
    items = await _to_infos(logs)
    return EntryLogList(list_data=items, count=len(items))


async def list_wallet_logs(
    wallet_id: str, current_user: CurrentUser, limit: int, cursor: str | None = None
) -> EntryLogPage:
    await open_general_wallet(wallet_id, current_user)
    page = await WalletEntryLogTable.find_page(wallet_id, limit=limit, cursor=cursor)
    return EntryLogPage(
        list_data=await _to_infos(page["list_data"]), next_cursor=page["next_cursor"]
    )
