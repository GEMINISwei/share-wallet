"""一般錢包之間的轉帳: 兩個錢包各一筆, 一起建立、一起修改、一起刪除 (見 docs/features.md〈轉帳〉)。

兩筆以 `transfer_id` 連在一起, 各自記著對方錢包。建立要同時是兩邊的成員; 修改、刪除要在兩邊都
有改刪權限。對方錢包被刪除後只剩這一邊, 由 `entries.delete_entry` 當成一般的帳刪。
"""

import uuid
from dataclasses import dataclass
from datetime import date
from typing import NoReturn

from shared.auth.contracts import CurrentUser
from shared.http.errors import LangException

from .access import WalletAccess, can_manage, is_super_admin
from .errors import WalletError
from .ledger import (
    balance_effect,
    can_modify,
    checked_balance,
    locked_balance,
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
    WalletDetail,
    WalletEntryTable,
    WalletKind,
    WalletMemberTable,
    WalletTable,
)
from .schema import EntryOperate, TransferCreate, TransferUpdate

_OPPOSITE = {
    EntryKind.TRANSFER_OUT: EntryKind.TRANSFER_IN,
    EntryKind.TRANSFER_IN: EntryKind.TRANSFER_OUT,
}


async def _counterpart_access(wallet_id: str, current_user: CurrentUser) -> WalletAccess | None:
    """對方錢包的授權。不是成員 (也不是超管) 時是 None, 由呼叫端決定回什麼錯誤。"""
    wallet = await WalletTable.find_detail_by_id(wallet_id)
    if wallet is None:
        return None
    role = await WalletMemberTable.find_role(wallet_id, current_user["id"])
    if role is None and not is_super_admin(current_user):
        return None
    return WalletAccess(wallet=wallet, role=role, can_manage=can_manage(role, current_user))


async def _lock_both(first: str, second: str) -> dict[str, int]:
    # 依 id 順序上鎖: 兩個請求反方向轉帳時, 各自先鎖自己這邊再等對方就會互相卡住。
    return {wallet_id: await locked_balance(wallet_id) for wallet_id in sorted((first, second))}


@dataclass(frozen=True)
class _Half:
    access: WalletAccess
    entry: EntryDetail


async def _create_half(
    access: WalletAccess,
    counterpart: WalletDetail,
    kind: EntryKind,
    transfer_id: str,
    form_data: TransferCreate,
    current_user: CurrentUser,
) -> str:
    created = await WalletEntryTable.create(
        data={
            "wallet_id": access.wallet["id"],
            "kind": kind,
            "amount": form_data.amount,
            "entry_date": form_data.entry_date,
            "note": form_data.note,
            "transfer_id": transfer_id,
            "counterpart_wallet_id": counterpart["id"],
            "created_by": current_user["id"],
        }
    )
    after = snapshot_of(
        kind,
        form_data.amount,
        form_data.entry_date,
        form_data.note,
        counterpart_wallet_name=counterpart["name"],
    )
    entry = (created["id"], current_user["id"])
    await write_log(access, current_user, entry, EntryLogAction.CREATE, None, after)
    return created["id"]


async def _joined_general_wallet(wallet_id: str, current_user: CurrentUser) -> WalletAccess:
    """建立轉帳的對方: 要是自己加入的一般錢包。超管沒加入也不行 (見 docs/features.md〈轉帳〉)。"""
    access = await _counterpart_access(wallet_id, current_user)
    if access is None or access.role is None:
        raise LangException(404, WalletError.TRANSFER_WALLET_NOT_FOUND)
    if access.wallet["kind"] != WalletKind.GENERAL:
        raise LangException(400, WalletError.TRANSFER_NOT_GENERAL)
    return access


async def create_transfer(
    wallet_id: str, form_data: TransferCreate, current_user: CurrentUser
) -> EntryOperate:
    access = await open_general_wallet(wallet_id, current_user)
    if access.role is None:
        raise LangException(403, WalletError.TRANSFER_NOT_MEMBER)
    if uuid.UUID(form_data.counterpart_wallet_id) == uuid.UUID(wallet_id):
        raise LangException(400, WalletError.TRANSFER_SAME_WALLET)
    other = await _joined_general_wallet(form_data.counterpart_wallet_id, current_user)
    other_id = other.wallet["id"]

    balances = await _lock_both(wallet_id, other_id)
    kind, other_kind = form_data.kind, _OPPOSITE[form_data.kind]
    new_balance = checked_balance(balances[wallet_id] + balance_effect(kind, form_data.amount))
    other_balance = checked_balance(
        balances[other_id] + balance_effect(other_kind, form_data.amount)
    )

    transfer_id = str(uuid.uuid4())
    created = await _create_half(access, other.wallet, kind, transfer_id, form_data, current_user)
    await _create_half(other, access.wallet, other_kind, transfer_id, form_data, current_user)
    await WalletTable.set_balance(wallet_id, new_balance)
    await WalletTable.set_balance(other_id, other_balance)
    return EntryOperate(id=created)


async def _modifiable_pair(
    access: WalletAccess, entry_id: str, counterpart_id: str, current_user: CurrentUser
) -> tuple[_Half, _Half, dict[str, int]]:
    """鎖住兩個錢包, 讀出兩邊的帳, 並確認兩邊都有改刪權限。"""
    other = await _counterpart_access(counterpart_id, current_user)
    balances = await _lock_both(access.wallet["id"], counterpart_id)
    entry = await WalletEntryTable.find_detail_in_wallet(access.wallet["id"], entry_id)
    if entry is None or entry["transfer_id"] is None:
        raise LangException(404, WalletError.ENTRY_NOT_FOUND)
    if not can_modify(access, entry["created_by"], current_user):
        raise LangException(403, WalletError.NOT_ENTRY_OWNER)
    if other is None or not can_modify(other, entry["created_by"], current_user):
        raise LangException(403, WalletError.TRANSFER_NO_ACCESS)
    other_entry = await WalletEntryTable.find_transfer_in_wallet(
        counterpart_id, entry["transfer_id"]
    )
    if other_entry is None:
        raise LangException(404, WalletError.ENTRY_NOT_FOUND)
    return _Half(access, entry), _Half(other, other_entry), balances


async def _reject_unpaired(
    access: WalletAccess, entry_id: str, current_user: CurrentUser
) -> NoReturn:
    """找不到對方錢包的帳: 依序回不存在、沒有權限、不是轉帳、對方錢包已刪除。"""
    entry = await WalletEntryTable.find_detail_in_wallet(access.wallet["id"], entry_id)
    if entry is None:
        raise LangException(404, WalletError.ENTRY_NOT_FOUND)
    if not can_modify(access, entry["created_by"], current_user):
        raise LangException(403, WalletError.NOT_ENTRY_OWNER)
    if entry["kind"] in ADVANCE_KINDS:
        raise LangException(400, WalletError.ADVANCE_KIND_IMMUTABLE)
    if entry["kind"] not in TRANSFER_KINDS:
        raise LangException(400, WalletError.ENTRY_KIND_IMMUTABLE)
    raise LangException(400, WalletError.TRANSFER_ORPHAN_IMMUTABLE)


def _changed_snapshot(entry: EntryDetail, amount: int, entry_date: date, note: str) -> dict:
    return snapshot_of(
        entry["kind"],
        amount,
        entry_date,
        note,
        counterpart_wallet_name=entry["counterpart_wallet_name"],
    )


async def update_transfer(
    wallet_id: str, entry_id: str, form_data: TransferUpdate, current_user: CurrentUser
) -> EntryOperate:
    """兩邊一起改金額、日期、備註。什麼都沒改時 `update_by_id` 丟出 `NoChangeError` (204)。"""
    access = await open_general_wallet(wallet_id, current_user)
    counterpart_id = await WalletEntryTable.find_counterpart_wallet_id(wallet_id, entry_id)
    if counterpart_id is None:
        await _reject_unpaired(access, entry_id, current_user)
    here, there, balances = await _modifiable_pair(access, entry_id, counterpart_id, current_user)

    new_balances = {}
    for half in (here, there):
        entry = half.entry
        delta = balance_effect(entry["kind"], form_data.amount) - balance_effect(
            entry["kind"], entry["amount"]
        )
        new_balances[entry["wallet_id"]] = checked_balance(balances[entry["wallet_id"]] + delta)

    data = {"amount": form_data.amount, "entry_date": form_data.entry_date, "note": form_data.note}
    for half in (here, there):
        await WalletEntryTable.update_by_id(id=half.entry["id"], data=data)
    for half in (here, there):
        entry = half.entry
        if form_data.amount != entry["amount"]:
            await WalletTable.set_balance(entry["wallet_id"], new_balances[entry["wallet_id"]])
        after = _changed_snapshot(entry, form_data.amount, form_data.entry_date, form_data.note)
        await write_log(
            half.access,
            current_user,
            (entry["id"], entry["created_by"]),
            EntryLogAction.UPDATE,
            snapshot(entry),
            after,
        )
    return EntryOperate(id=entry_id)


async def delete_transfer(
    access: WalletAccess, entry_id: str, counterpart_id: str, current_user: CurrentUser
) -> EntryOperate:
    """兩邊一起反向套用。由 `entries.delete_entry` 在確認這筆是轉帳、對方錢包還在之後呼叫。"""
    here, there, balances = await _modifiable_pair(access, entry_id, counterpart_id, current_user)
    for half in (here, there):
        entry = half.entry
        wallet_id = entry["wallet_id"]
        new_balance = checked_balance(
            balances[wallet_id] - balance_effect(entry["kind"], entry["amount"])
        )
        await WalletEntryTable.delete_in_wallet(wallet_id, entry["id"])
        await WalletTable.set_balance(wallet_id, new_balance)
        await write_log(
            half.access,
            current_user,
            (entry["id"], entry["created_by"]),
            EntryLogAction.DELETE,
            snapshot(entry),
            None,
        )
    return EntryOperate(id=entry_id)
