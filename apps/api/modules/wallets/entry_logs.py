"""帳目的異動紀錄: 一筆帳的歷史、整個錢包的紀錄。寫入在 `ledger.py`。

所有成員都看得到 (見 docs/features/members.md〈紀錄〉), 所以只檢查打不打得開錢包。
兩種錢包的紀錄存在同一張表, 快照的形狀不同 (`EntrySnapshot`、`ExpenseSnapshot`),
所以各有一組端點: 一個錢包只會有其中一種。
"""

from modules.users.public import find_nicknames
from shared.auth.contracts import CurrentUser
from shared.http.errors import LangException

from .access import open_travel_wallet
from .errors import WalletError
from .ledger import open_general_wallet
from .model import EntryLogDetail, WalletEntryLogTable
from .schema import (
    EntryLogInfo,
    EntryLogList,
    EntryLogPage,
    EntrySnapshot,
    EntryUser,
    ExpenseLogInfo,
    ExpenseLogList,
    ExpenseLogPage,
    ExpenseSnapshot,
)


async def _actors(logs: list[EntryLogDetail]) -> dict[str, EntryUser]:
    nicknames = await find_nicknames(list({log["actor_id"] for log in logs}))
    return {
        user_id: EntryUser(user_id=user_id, nickname=nicknames.get(user_id, ""))
        for user_id in {log["actor_id"] for log in logs}
    }


async def _to_infos(logs: list[EntryLogDetail]) -> list[EntryLogInfo]:
    actors = await _actors(logs)
    return [
        EntryLogInfo(
            id=log["id"],
            entry_id=log["entry_id"],
            action=log["action"],
            actor=actors[log["actor_id"]],
            as_super_admin=log["as_super_admin"],
            before=None if log["before"] is None else EntrySnapshot.model_validate(log["before"]),
            after=None if log["after"] is None else EntrySnapshot.model_validate(log["after"]),
            created_at=log["created_at"],
        )
        for log in logs
    ]


async def _to_expense_infos(logs: list[EntryLogDetail]) -> list[ExpenseLogInfo]:
    actors = await _actors(logs)

    def snapshot(value: dict | None) -> ExpenseSnapshot | None:
        return None if value is None else ExpenseSnapshot.model_validate(value)

    return [
        ExpenseLogInfo(
            id=log["id"],
            entry_id=log["entry_id"],
            action=log["action"],
            actor=actors[log["actor_id"]],
            as_super_admin=log["as_super_admin"],
            before=snapshot(log["before"]),
            after=snapshot(log["after"]),
            created_at=log["created_at"],
        )
        for log in logs
    ]


async def _logs_of_entry(wallet_id: str, entry_id: str) -> list[EntryLogDetail]:
    """含已刪除的帳: 每筆帳都有一筆「新增」, 一筆都沒有就是這個錢包沒有這筆帳。"""
    logs = await WalletEntryLogTable.list_for_entry(wallet_id, entry_id)
    if not logs:
        raise LangException(404, WalletError.ENTRY_NOT_FOUND)
    return logs


async def list_entry_logs(wallet_id: str, entry_id: str, current_user: CurrentUser) -> EntryLogList:
    await open_general_wallet(wallet_id, current_user)
    items = await _to_infos(await _logs_of_entry(wallet_id, entry_id))
    return EntryLogList(list_data=items, count=len(items))


async def list_wallet_logs(
    wallet_id: str, current_user: CurrentUser, limit: int, cursor: str | None = None
) -> EntryLogPage:
    await open_general_wallet(wallet_id, current_user)
    page = await WalletEntryLogTable.find_page(wallet_id, limit=limit, cursor=cursor)
    return EntryLogPage(
        list_data=await _to_infos(page["list_data"]), next_cursor=page["next_cursor"]
    )


async def list_expense_logs(
    wallet_id: str, expense_id: str, current_user: CurrentUser
) -> ExpenseLogList:
    await open_travel_wallet(wallet_id, current_user)
    items = await _to_expense_infos(await _logs_of_entry(wallet_id, expense_id))
    return ExpenseLogList(list_data=items, count=len(items))


async def list_wallet_expense_logs(
    wallet_id: str, current_user: CurrentUser, limit: int, cursor: str | None = None
) -> ExpenseLogPage:
    await open_travel_wallet(wallet_id, current_user)
    page = await WalletEntryLogTable.find_page(wallet_id, limit=limit, cursor=cursor)
    return ExpenseLogPage(
        list_data=await _to_expense_infos(page["list_data"]), next_cursor=page["next_cursor"]
    )
