"""代墊與還款: 錢包替某人墊付, 之後對著那一筆代墊還款 (見 docs/features.md〈代墊與還款〉)。

每筆代墊的未還金額與每個對象的未還金額都是存起來的值, 與餘額在同一把鎖 (`locked_balance`)
底下一起更新。規則只有一條: 未還金額永遠不能是負的, 新增、修改、刪除都照它檢查。
刪除走 `entries.delete_entry`, 由它呼叫這裡的 `release_on_delete`。
"""

from shared.auth.contracts import CurrentUser
from shared.http.errors import LangException

from .access import WalletAccess
from .errors import WalletError
from .ledger import (
    checked_balance,
    locked_balance,
    modifiable_entry,
    open_general_wallet,
    snapshot,
    snapshot_of,
    write_log,
)
from .model import (
    EntryDetail,
    EntryKind,
    EntryLogAction,
    WalletAdvanceTargetTable,
    WalletEntryTable,
    WalletTable,
)
from .schema import AdvanceCreate, AdvanceTargetInfo, AdvanceTargetList, EntryOperate, MoneyUpdate


async def _add_outstanding(target_id: str, delta: int) -> None:
    # 寫入之後才知道總和; 超出範圍時丟出例外, 整個請求一起回滾。
    checked_balance(await WalletAdvanceTargetTable.add_outstanding(target_id, delta))


def _changed_snapshot(entry: EntryDetail, form_data: MoneyUpdate) -> dict:
    return snapshot_of(
        entry["kind"],
        form_data.amount,
        form_data.entry_date,
        form_data.note,
        advance_target_name=entry["advance_target_name"],
    )


async def _log_update(
    access: WalletAccess, current_user: CurrentUser, entry: EntryDetail, form_data: MoneyUpdate
) -> None:
    await write_log(
        access,
        current_user,
        (entry["id"], entry["created_by"]),
        EntryLogAction.UPDATE,
        snapshot(entry),
        _changed_snapshot(entry, form_data),
    )


async def _entry_of_kind(
    access: WalletAccess, entry_id: str, kind: EntryKind, current_user: CurrentUser
) -> EntryDetail:
    entry = await modifiable_entry(access, entry_id, current_user)
    if entry["kind"] is not kind:
        raise LangException(400, WalletError.ADVANCE_KIND_IMMUTABLE)
    return entry


async def _find_advance(wallet_id: str, advance_id: str) -> EntryDetail:
    advance = await WalletEntryTable.find_detail_in_wallet(wallet_id, advance_id)
    if advance is None or advance["kind"] is not EntryKind.ADVANCE:
        raise LangException(404, WalletError.ADVANCE_NOT_FOUND)
    return advance


async def _set_advance_outstanding(advance: EntryDetail, outstanding: int) -> None:
    await WalletEntryTable.update_by_id(id=advance["id"], data={"outstanding": outstanding})


async def create_advance(
    wallet_id: str, form_data: AdvanceCreate, current_user: CurrentUser
) -> EntryOperate:
    access = await open_general_wallet(wallet_id, current_user)
    new_balance = checked_balance(await locked_balance(wallet_id) - form_data.amount)
    target = await WalletAdvanceTargetTable.find_or_create(wallet_id, form_data.target_name)

    created = await WalletEntryTable.create(
        data={
            "wallet_id": wallet_id,
            "kind": EntryKind.ADVANCE,
            "amount": form_data.amount,
            "advance_target_id": target["id"],
            "outstanding": form_data.amount,
            "entry_date": form_data.entry_date,
            "note": form_data.note,
            "created_by": current_user["id"],
        }
    )
    await WalletTable.set_balance(wallet_id, new_balance)
    await _add_outstanding(target["id"], form_data.amount)
    after = snapshot_of(
        EntryKind.ADVANCE,
        form_data.amount,
        form_data.entry_date,
        form_data.note,
        advance_target_name=target["name"],
    )
    entry = (created["id"], current_user["id"])
    await write_log(access, current_user, entry, EntryLogAction.CREATE, None, after)
    return EntryOperate(id=created["id"])


async def update_advance(
    wallet_id: str, entry_id: str, form_data: MoneyUpdate, current_user: CurrentUser
) -> EntryOperate:
    """改金額時未還金額跟著變, 但不能小於已還的。什麼都沒改時丟出 `NoChangeError` (204)。"""
    access = await open_general_wallet(wallet_id, current_user)
    balance = await locked_balance(wallet_id)
    entry = await _entry_of_kind(access, entry_id, EntryKind.ADVANCE, current_user)
    outstanding = entry["outstanding"] or 0
    repaid = entry["amount"] - outstanding
    if form_data.amount < repaid:
        raise LangException(400, WalletError.ADVANCE_BELOW_REPAID)
    delta = form_data.amount - entry["amount"]
    new_balance = checked_balance(balance - delta)

    await WalletEntryTable.update_by_id(
        id=entry_id,
        data={
            "amount": form_data.amount,
            "outstanding": outstanding + delta,
            "entry_date": form_data.entry_date,
            "note": form_data.note,
        },
    )
    if delta:
        await WalletTable.set_balance(wallet_id, new_balance)
        await _add_outstanding(entry["advance_target_id"] or "", delta)
    await _log_update(access, current_user, entry, form_data)
    return EntryOperate(id=entry_id)


async def create_repayment(
    wallet_id: str, advance_id: str, form_data: MoneyUpdate, current_user: CurrentUser
) -> EntryOperate:
    """任何成員都能替任何一筆代墊記還款; 上限是那一筆的未還金額。"""
    access = await open_general_wallet(wallet_id, current_user)
    balance = await locked_balance(wallet_id)
    advance = await _find_advance(wallet_id, advance_id)
    outstanding = advance["outstanding"] or 0
    if form_data.amount > outstanding:
        raise LangException(400, WalletError.REPAYMENT_EXCEEDS_OUTSTANDING)
    new_balance = checked_balance(balance + form_data.amount)

    created = await WalletEntryTable.create(
        data={
            "wallet_id": wallet_id,
            "kind": EntryKind.REPAYMENT,
            "amount": form_data.amount,
            "advance_target_id": advance["advance_target_id"],
            "advance_id": advance["id"],
            "entry_date": form_data.entry_date,
            "note": form_data.note,
            "created_by": current_user["id"],
        }
    )
    await _set_advance_outstanding(advance, outstanding - form_data.amount)
    await WalletTable.set_balance(wallet_id, new_balance)
    await _add_outstanding(advance["advance_target_id"] or "", -form_data.amount)
    after = snapshot_of(
        EntryKind.REPAYMENT,
        form_data.amount,
        form_data.entry_date,
        form_data.note,
        advance_target_name=advance["advance_target_name"],
    )
    entry = (created["id"], current_user["id"])
    await write_log(access, current_user, entry, EntryLogAction.CREATE, None, after)
    return EntryOperate(id=created["id"])


async def update_repayment(
    wallet_id: str, entry_id: str, form_data: MoneyUpdate, current_user: CurrentUser
) -> EntryOperate:
    """上限是「代墊目前的未還 + 這筆原本的金額」。什麼都沒改時丟出 `NoChangeError` (204)。"""
    access = await open_general_wallet(wallet_id, current_user)
    balance = await locked_balance(wallet_id)
    entry = await _entry_of_kind(access, entry_id, EntryKind.REPAYMENT, current_user)
    advance = await _find_advance(wallet_id, entry["advance_id"] or "")
    outstanding = advance["outstanding"] or 0
    if form_data.amount > outstanding + entry["amount"]:
        raise LangException(400, WalletError.REPAYMENT_EXCEEDS_OUTSTANDING)
    delta = form_data.amount - entry["amount"]
    new_balance = checked_balance(balance + delta)

    await WalletEntryTable.update_by_id(
        id=entry_id,
        data={
            "amount": form_data.amount,
            "entry_date": form_data.entry_date,
            "note": form_data.note,
        },
    )
    if delta:
        await _set_advance_outstanding(advance, outstanding - delta)
        await WalletTable.set_balance(wallet_id, new_balance)
        await _add_outstanding(entry["advance_target_id"] or "", -delta)
    await _log_update(access, current_user, entry, form_data)
    return EntryOperate(id=entry_id)


async def release_on_delete(wallet_id: str, entry: EntryDetail) -> None:
    """刪除代墊或還款前, 把它對未還金額的影響撤掉。其他種類什麼都不做。

    有還款的代墊不能刪: 還款會失去對象, 而連同還款一起刪又會一次改掉別人記的帳。
    """
    target_id = entry["advance_target_id"] or ""
    if entry["kind"] is EntryKind.ADVANCE:
        if (entry["outstanding"] or 0) < entry["amount"]:
            raise LangException(400, WalletError.ADVANCE_HAS_REPAYMENTS)
        await _add_outstanding(target_id, -entry["amount"])
    elif entry["kind"] is EntryKind.REPAYMENT:
        advance = await _find_advance(wallet_id, entry["advance_id"] or "")
        await _set_advance_outstanding(advance, (advance["outstanding"] or 0) + entry["amount"])
        await _add_outstanding(target_id, entry["amount"])


async def list_targets(wallet_id: str, current_user: CurrentUser) -> AdvanceTargetList:
    await open_general_wallet(wallet_id, current_user)
    targets = await WalletAdvanceTargetTable.list_in_wallet(wallet_id)
    items = [AdvanceTargetInfo(name=t["name"], outstanding=t["outstanding"]) for t in targets]
    return AdvanceTargetList(list_data=items, count=len(items))
