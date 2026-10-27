"""旅遊錢包的帳: 誰付了多少、每人分攤多少, 以及每人的淨額。規則見 docs/features/travel-wallet.md。

旅遊錢包沒有餘額, 但寫入一樣先鎖住錢包那一列: 移除成員也鎖同一列 (見 `members.py`),
不鎖的話移除的同時可以記進一筆以他為分攤對象的帳, 留下一個不是成員的人;
開始結算也鎖同一列 (見 `settlement.py`), 鎖住之後才看狀態, 方案算完就不會再有帳寫進來。
"""

from datetime import date
from typing import TypedDict

from modules.users.public import find_nicknames
from shared.auth.contracts import CurrentUser
from shared.http.errors import LangException, NoChangeError

from .access import WalletAccess, open_travel_wallet
from .errors import WalletError
from .ledger import ensure_can_modify, totals_by_person, write_log
from .model import (
    EntryLogAction,
    ExpenseDetail,
    ShareDetail,
    SplitMode,
    TravelExpenseTable,
    WalletMemberTable,
    WalletStatus,
    WalletTable,
)
from .rules import split_equally
from .schema import (
    CustomExpenseCreate,
    EntryOperate,
    EntryUser,
    EqualExpenseCreate,
    ExpenseInfo,
    ExpensePage,
    ExpenseShare,
    ExpenseSnapshot,
    NetBalanceInfo,
    NetBalanceList,
    ShareSnapshot,
)

ExpenseForm = EqualExpenseCreate | CustomExpenseCreate


class _Fields(TypedDict):
    """表單上存進 `travel_expenses` 那一列的欄位 (分攤另存)。"""

    amount: int
    payer_id: str
    split_mode: SplitMode
    entry_date: date
    note: str


async def _lock_ledger(wallet_id: str) -> None:
    """開始結算之後帳目鎖住 (見 docs/features/travel-wallet.md〈結算流程〉)。"""
    if await WalletTable.lock_status(wallet_id) is not WalletStatus.ACTIVE:
        raise LangException(409, WalletError.LEDGER_LOCKED)


async def _shares(wallet_id: str, form_data: ExpenseForm) -> list[ShareDetail]:
    """檢查付款人與分攤對象都是成員, 算出每人分攤的金額。在鎖住錢包之後呼叫。"""
    member_ids = [member["user_id"] for member in await WalletMemberTable.list_members(wallet_id)]
    if form_data.payer_id not in member_ids:
        raise LangException(400, WalletError.PAYER_NOT_MEMBER)
    if isinstance(form_data, EqualExpenseCreate):
        participant_ids = form_data.participant_ids
    else:
        participant_ids = [share.user_id for share in form_data.shares]
    if not set(participant_ids) <= set(member_ids):
        raise LangException(400, WalletError.PARTICIPANT_NOT_MEMBER)
    if isinstance(form_data, EqualExpenseCreate):
        return split_equally(form_data.amount, form_data.payer_id, participant_ids, member_ids)
    return [{"user_id": share.user_id, "amount": share.amount} for share in form_data.shares]


def _fields(form_data: ExpenseForm) -> _Fields:
    return {
        "amount": form_data.amount,
        "payer_id": form_data.payer_id,
        "split_mode": form_data.split_mode,
        "entry_date": form_data.entry_date,
        "note": form_data.note,
    }


def _unchanged(expense: ExpenseDetail, fields: _Fields, shares: list[ShareDetail]) -> bool:
    return (
        expense["amount"] == fields["amount"]
        and expense["payer_id"] == fields["payer_id"]
        and expense["split_mode"] == fields["split_mode"]
        and expense["entry_date"] == fields["entry_date"]
        and expense["note"] == fields["note"]
        and expense["shares"] == shares
    )


async def _snapshot(fields: _Fields | ExpenseDetail, shares: list[ShareDetail]) -> dict:
    """存當時的暱稱, 理由同一般錢包的分類名稱 (見 `WalletEntryLogTable`)。"""
    user_ids = [fields["payer_id"], *(share["user_id"] for share in shares)]
    nicknames = await find_nicknames(list(set(user_ids)))
    return ExpenseSnapshot(
        amount=fields["amount"],
        payer_name=nicknames.get(fields["payer_id"], ""),
        split_mode=fields["split_mode"],
        shares=[
            ShareSnapshot(name=nicknames.get(share["user_id"], ""), amount=share["amount"])
            for share in shares
        ],
        entry_date=fields["entry_date"],
        note=fields["note"],
    ).model_dump(mode="json")


async def _modifiable_expense(
    access: WalletAccess, expense_id: str, current_user: CurrentUser
) -> ExpenseDetail:
    expense = await TravelExpenseTable.find_detail_in_wallet(access.wallet["id"], expense_id)
    if expense is None:
        raise LangException(404, WalletError.ENTRY_NOT_FOUND)
    ensure_can_modify(access, expense["created_by"], current_user)
    return expense


async def create_expense(
    wallet_id: str, form_data: ExpenseForm, current_user: CurrentUser
) -> EntryOperate:
    access = await open_travel_wallet(wallet_id, current_user)
    await _lock_ledger(wallet_id)
    shares = await _shares(wallet_id, form_data)
    fields = _fields(form_data)

    expense_id = await TravelExpenseTable.create_with_shares(
        data={"wallet_id": wallet_id, "created_by": current_user["id"], **fields},
        shares=shares,
    )
    after = await _snapshot(fields, shares)
    entry = (expense_id, current_user["id"])
    await write_log(access, current_user, entry, EntryLogAction.CREATE, None, after)
    return EntryOperate(id=expense_id)


async def update_expense(
    wallet_id: str, expense_id: str, form_data: ExpenseForm, current_user: CurrentUser
) -> EntryOperate:
    """所有欄位都可以改。什麼都沒改時丟出 `NoChangeError` (204), 不留紀錄。"""
    access = await open_travel_wallet(wallet_id, current_user)
    await _lock_ledger(wallet_id)
    expense = await _modifiable_expense(access, expense_id, current_user)
    shares = await _shares(wallet_id, form_data)
    fields = _fields(form_data)
    if _unchanged(expense, fields, shares):
        raise NoChangeError()

    await TravelExpenseTable.replace_in_wallet(wallet_id, expense_id, dict(fields), shares)
    before = await _snapshot(expense, expense["shares"])
    after = await _snapshot(fields, shares)
    entry = (expense_id, expense["created_by"])
    await write_log(access, current_user, entry, EntryLogAction.UPDATE, before, after)
    return EntryOperate(id=expense_id)


async def delete_expense(
    wallet_id: str, expense_id: str, current_user: CurrentUser
) -> EntryOperate:
    access = await open_travel_wallet(wallet_id, current_user)
    await _lock_ledger(wallet_id)
    expense = await _modifiable_expense(access, expense_id, current_user)

    await TravelExpenseTable.delete_in_wallet(wallet_id, expense_id)
    before = await _snapshot(expense, expense["shares"])
    entry = (expense_id, expense["created_by"])
    await write_log(access, current_user, entry, EntryLogAction.DELETE, before, None)
    return EntryOperate(id=expense_id)


async def list_expenses(
    wallet_id: str, current_user: CurrentUser, limit: int, cursor: str | None = None
) -> ExpensePage:
    await open_travel_wallet(wallet_id, current_user)
    page = await TravelExpenseTable.find_page(wallet_id, limit=limit, cursor=cursor)
    expenses = page["list_data"]
    user_ids = {
        user_id
        for expense in expenses
        for user_id in (
            expense["payer_id"],
            expense["created_by"],
            *(share["user_id"] for share in expense["shares"]),
        )
    }
    nicknames = await find_nicknames(list(user_ids))

    def person(user_id: str) -> EntryUser:
        return EntryUser(user_id=user_id, nickname=nicknames.get(user_id, ""))

    items = [
        ExpenseInfo(
            id=expense["id"],
            amount=expense["amount"],
            payer=person(expense["payer_id"]),
            split_mode=SplitMode(expense["split_mode"]),
            shares=[
                ExpenseShare(
                    user_id=share["user_id"],
                    nickname=nicknames.get(share["user_id"], ""),
                    amount=share["amount"],
                )
                for share in expense["shares"]
            ],
            entry_date=expense["entry_date"],
            note=expense["note"],
            created_by=person(expense["created_by"]),
            created_at=expense["created_at"],
        )
        for expense in expenses
    ]
    return ExpensePage(list_data=items, next_cursor=page["next_cursor"])


async def list_net_balances(wallet_id: str, current_user: CurrentUser) -> NetBalanceList:
    await open_travel_wallet(wallet_id, current_user)
    people = await totals_by_person(wallet_id)
    nicknames = await find_nicknames([user_id for user_id, _ in people])
    items = [
        NetBalanceInfo(
            user_id=user_id,
            nickname=nicknames.get(user_id, ""),
            paid=total["paid"],
            owed=total["owed"],
            net=total["paid"] - total["owed"],
        )
        for user_id, total in people
    ]
    return NetBalanceList(list_data=items, count=len(items))
