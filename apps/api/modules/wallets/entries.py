"""一般錢包的帳目: 收入、支出與調整餘額, 以及所有帳目共用的刪除與列表。

上鎖與異動紀錄的步驟在 `ledger.py`, 轉帳的兩邊在 `transfers.py`, 代墊與還款在 `advances.py`,
異動紀錄的讀取在 `entry_logs.py`。
"""

from modules.users.public import find_nicknames
from shared.auth.contracts import CurrentUser
from shared.http.errors import LangException

from .advances import release_on_delete
from .errors import WalletError
from .ledger import (
    balance_effect,
    checked_balance,
    locked_balance,
    modifiable_entry,
    open_general_wallet,
    snapshot,
    snapshot_of,
    write_log,
)
from .model import (
    ADVANCE_KINDS,
    TRANSFER_KINDS,
    EntryDetail,
    EntryKind,
    EntryLogAction,
    WalletCategoryTable,
    WalletEntryTable,
    WalletTable,
)
from .schema import (
    BalanceAdjust,
    EntryCategory,
    EntryCreate,
    EntryInfo,
    EntryOperate,
    EntryPage,
    EntryUpdate,
    RepaymentList,
    EntryUser,
    EntryWallet,
)
from .transfers import delete_transfer


async def _category_name(wallet_id: str, form_data: EntryCreate, keep_id: str | None) -> str:
    """選的分類要在這個錢包、類型對、沒有封存; 唯一的例外是修改時保留原本的分類。"""
    category = await WalletCategoryTable.find_detail_in_wallet(wallet_id, form_data.category_id)
    archived = category is not None and category["archived_at"] is not None
    if category is None or (archived and form_data.category_id != keep_id):
        raise LangException(404, WalletError.CATEGORY_NOT_FOUND)
    if category["type"] != form_data.kind:
        raise LangException(400, WalletError.CATEGORY_TYPE_MISMATCH)
    return category["name"]


async def create_entry(
    wallet_id: str, form_data: EntryCreate, current_user: CurrentUser
) -> EntryOperate:
    access = await open_general_wallet(wallet_id, current_user)
    balance = await locked_balance(wallet_id)
    category_name = await _category_name(wallet_id, form_data, keep_id=None)
    new_balance = checked_balance(balance + balance_effect(form_data.kind, form_data.amount))

    created = await WalletEntryTable.create(
        data={
            "wallet_id": wallet_id,
            "kind": form_data.kind,
            "amount": form_data.amount,
            "category_id": form_data.category_id,
            "entry_date": form_data.entry_date,
            "note": form_data.note,
            "created_by": current_user["id"],
        }
    )
    await WalletTable.set_balance(wallet_id, new_balance)
    after = snapshot_of(
        form_data.kind,
        form_data.amount,
        form_data.entry_date,
        form_data.note,
        category_name=category_name,
    )
    await write_log(
        access,
        current_user,
        (created["id"], current_user["id"]),
        EntryLogAction.CREATE,
        None,
        after,
    )
    return EntryOperate(id=created["id"])


async def adjust_balance(
    wallet_id: str, form_data: BalanceAdjust, current_user: CurrentUser
) -> EntryOperate:
    """記下實際餘額與目前餘額的差額。差額存成固定值, 之後改更早的帳不會重算。"""
    access = await open_general_wallet(wallet_id, current_user)
    difference = form_data.balance - await locked_balance(wallet_id)
    if difference == 0:
        raise LangException(400, WalletError.BALANCE_UNCHANGED)

    created = await WalletEntryTable.create(
        data={
            "wallet_id": wallet_id,
            "kind": EntryKind.ADJUSTMENT,
            "amount": difference,
            "entry_date": form_data.entry_date,
            "note": form_data.note,
            "created_by": current_user["id"],
        }
    )
    await WalletTable.set_balance(wallet_id, form_data.balance)
    after = snapshot_of(EntryKind.ADJUSTMENT, difference, form_data.entry_date, form_data.note)
    await write_log(
        access,
        current_user,
        (created["id"], current_user["id"]),
        EntryLogAction.CREATE,
        None,
        after,
    )
    return EntryOperate(id=created["id"])


async def update_entry(
    wallet_id: str, entry_id: str, form_data: EntryUpdate, current_user: CurrentUser
) -> EntryOperate:
    """套用新舊差額。什麼都沒改時 `update_by_id` 丟出 `NoChangeError` (204), 不留紀錄。"""
    access = await open_general_wallet(wallet_id, current_user)
    balance = await locked_balance(wallet_id)
    entry = await modifiable_entry(access, entry_id, current_user)
    if entry["kind"] in TRANSFER_KINDS:
        raise LangException(400, WalletError.ENTRY_KIND_IMMUTABLE)
    if entry["kind"] in ADVANCE_KINDS:
        raise LangException(400, WalletError.ADVANCE_KIND_IMMUTABLE)
    if entry["kind"] is EntryKind.ADJUSTMENT:
        raise LangException(400, WalletError.ADJUSTMENT_IMMUTABLE)
    category_name = await _category_name(wallet_id, form_data, keep_id=entry["category_id"])
    delta = balance_effect(form_data.kind, form_data.amount) - balance_effect(
        entry["kind"], entry["amount"]
    )
    new_balance = checked_balance(balance + delta)

    await WalletEntryTable.update_by_id(
        id=entry_id,
        data={
            "kind": form_data.kind,
            "amount": form_data.amount,
            "category_id": form_data.category_id,
            "entry_date": form_data.entry_date,
            "note": form_data.note,
        },
    )
    if delta:
        await WalletTable.set_balance(wallet_id, new_balance)
    after = snapshot_of(
        form_data.kind,
        form_data.amount,
        form_data.entry_date,
        form_data.note,
        category_name=category_name,
    )
    await write_log(
        access,
        current_user,
        (entry_id, entry["created_by"]),
        EntryLogAction.UPDATE,
        snapshot(entry),
        after,
    )
    return EntryOperate(id=entry_id)


async def delete_entry(wallet_id: str, entry_id: str, current_user: CurrentUser) -> EntryOperate:
    """反向套用這筆帳; 調整也可以刪 (見 docs/features.md〈餘額〉)。

    轉帳兩邊一起刪; 對方錢包已刪除的轉帳只剩這一邊, 照一般的帳刪。
    代墊與還款另外撤掉對未還金額的影響, 有還款的代墊不能刪。
    """
    access = await open_general_wallet(wallet_id, current_user)
    counterpart_id = await WalletEntryTable.find_counterpart_wallet_id(wallet_id, entry_id)
    if counterpart_id is not None:
        return await delete_transfer(access, entry_id, counterpart_id, current_user)
    balance = await locked_balance(wallet_id)
    entry = await modifiable_entry(access, entry_id, current_user)
    new_balance = checked_balance(balance - balance_effect(entry["kind"], entry["amount"]))
    await release_on_delete(wallet_id, entry)

    await WalletEntryTable.delete_in_wallet(wallet_id, entry_id)
    await WalletTable.set_balance(wallet_id, new_balance)
    await write_log(
        access,
        current_user,
        (entry_id, entry["created_by"]),
        EntryLogAction.DELETE,
        snapshot(entry),
        None,
    )
    return EntryOperate(id=entry_id)


async def _entry_infos(entries: list[EntryDetail]) -> list[EntryInfo]:
    nicknames = await find_nicknames(list({entry["created_by"] for entry in entries}))
    return [
        EntryInfo(
            id=entry["id"],
            kind=entry["kind"],
            amount=entry["amount"],
            category=(
                None
                if entry["category_id"] is None
                else EntryCategory(id=entry["category_id"], name=entry["category_name"] or "")
            ),
            counterpart_wallet=(
                None
                if entry["counterpart_wallet_id"] is None
                else EntryWallet(
                    id=entry["counterpart_wallet_id"], name=entry["counterpart_wallet_name"] or ""
                )
            ),
            advance_target_name=entry["advance_target_name"],
            advance_id=entry["advance_id"],
            outstanding=entry["outstanding"],
            entry_date=entry["entry_date"],
            note=entry["note"],
            created_by=EntryUser(
                user_id=entry["created_by"], nickname=nicknames.get(entry["created_by"], "")
            ),
            created_at=entry["created_at"],
        )
        for entry in entries
    ]


async def list_entries(
    wallet_id: str, current_user: CurrentUser, limit: int, cursor: str | None = None
) -> EntryPage:
    await open_general_wallet(wallet_id, current_user)
    page = await WalletEntryTable.find_page(wallet_id, limit=limit, cursor=cursor)
    return EntryPage(list_data=await _entry_infos(page["list_data"]), next_cursor=page["next_cursor"])


async def list_repayments(
    wallet_id: str, advance_id: str, current_user: CurrentUser
) -> RepaymentList:
    await open_general_wallet(wallet_id, current_user)
    advance = await WalletEntryTable.find_detail_in_wallet(wallet_id, advance_id)
    if advance is None or advance["kind"] is not EntryKind.ADVANCE:
        raise LangException(404, WalletError.ADVANCE_NOT_FOUND)
    items = await _entry_infos(await WalletEntryTable.list_repayments(wallet_id, advance_id))
    return RepaymentList(list_data=items, count=len(items))
