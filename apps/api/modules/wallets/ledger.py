"""收支、轉帳與代墊 (`entries.py`、`transfers.py`、`advances.py`) 共用的記帳步驟。

鎖餘額、檢查範圍、留異動紀錄。其中權限檢查與異動紀錄的寫入, 旅遊錢包的帳 (`expenses.py`) 也共用;
每人的合計與淨額由旅遊錢包的帳與結算 (`settlement.py`) 共用。

餘額是存起來的值 (見 docs/features/general-wallet.md〈餘額〉): 每個寫入都先
`WalletTable.lock_balance` 鎖住錢包, 再在同一個請求的交易裡改帳目、改餘額、留異動紀錄 ——
任何一步丟出例外時 middleware 整批回滾, 三者不會只寫進一部分。
"""

from datetime import date

from shared.auth.contracts import CurrentUser
from shared.http.errors import LangException

from .access import WalletAccess, is_super_admin, open_wallet
from .errors import WalletError
from .model import (
    EntryDetail,
    EntryKind,
    EntryLogAction,
    MemberRole,
    MemberTotals,
    TravelExpenseTable,
    WalletEntryLogTable,
    WalletEntryTable,
    WalletKind,
    WalletMemberTable,
    WalletTable,
)
from .schema import MAX_SAFE_AMOUNT, EntrySnapshot

#: 讓餘額變少的種類。代墊是錢包替別人付出去的錢。
_OUTFLOW = frozenset({EntryKind.EXPENSE, EntryKind.TRANSFER_OUT, EntryKind.ADVANCE})


def balance_effect(kind: EntryKind, amount: int) -> int:
    """這筆帳讓餘額變多少。調整的 `amount` 本身就是帶正負號的差額。"""
    return -amount if kind in _OUTFLOW else amount


async def open_general_wallet(wallet_id: str, current_user: CurrentUser) -> WalletAccess:
    access = await open_wallet(wallet_id, current_user)
    # 旅遊錢包記的是誰付了、誰分攤, 不是收支 (見 docs/features/travel-wallet.md)。
    if access.wallet["kind"] != WalletKind.GENERAL:
        raise LangException(400, WalletError.NOT_GENERAL)
    return access


def can_modify(access: WalletAccess, owner_id: str, current_user: CurrentUser) -> bool:
    """自己記的帳, 或管理者 (含超級管理者) 改任何人的帳。"""
    return owner_id == current_user["id"] or access.can_manage


def ensure_can_modify(access: WalletAccess, owner_id: str, current_user: CurrentUser) -> None:
    """旅遊錢包的帳 (`expenses.py`) 也用這一條。"""
    if not can_modify(access, owner_id, current_user):
        raise LangException(403, WalletError.NOT_ENTRY_OWNER)


async def modifiable_entry(
    access: WalletAccess, entry_id: str, current_user: CurrentUser
) -> EntryDetail:
    entry = await WalletEntryTable.find_detail_in_wallet(access.wallet["id"], entry_id)
    if entry is None:
        raise LangException(404, WalletError.ENTRY_NOT_FOUND)
    ensure_can_modify(access, entry["created_by"], current_user)
    return entry


def as_super_admin(access: WalletAccess, owner_id: str, current_user: CurrentUser) -> bool:
    """這次操作是不是靠超管身分才做得到 (見 docs/features/members.md〈紀錄〉)。"""
    if not is_super_admin(current_user):
        return False
    if access.role is None:
        return True
    return owner_id != current_user["id"] and access.role is not MemberRole.ADMIN


async def locked_balance(wallet_id: str) -> int:
    balance = await WalletTable.lock_balance(wallet_id)
    if balance is None:
        raise LangException(404, WalletError.NOT_FOUND)
    return balance


def checked_balance(balance: int) -> int:
    # 超過這個值送到瀏覽器就會失真 (見 schema.py 的 MAX_SAFE_AMOUNT), 而且不會有任何錯誤。
    if abs(balance) > MAX_SAFE_AMOUNT:
        raise LangException(400, WalletError.BALANCE_OUT_OF_RANGE)
    return balance


def snapshot_of(
    kind: EntryKind,
    amount: int,
    entry_date: date,
    note: str,
    *,
    category_name: str | None = None,
    counterpart_wallet_name: str | None = None,
    advance_target_name: str | None = None,
) -> dict:
    return EntrySnapshot(
        kind=kind,
        amount=amount,
        category_name=category_name,
        counterpart_wallet_name=counterpart_wallet_name,
        advance_target_name=advance_target_name,
        entry_date=entry_date,
        note=note,
    ).model_dump(mode="json")


def snapshot(entry: EntryDetail) -> dict:
    return snapshot_of(
        entry["kind"],
        entry["amount"],
        entry["entry_date"],
        entry["note"],
        category_name=entry["category_name"],
        counterpart_wallet_name=entry["counterpart_wallet_name"],
        advance_target_name=entry["advance_target_name"],
    )


async def write_log(
    access: WalletAccess,
    current_user: CurrentUser,
    entry: tuple[str, str],
    action: EntryLogAction,
    before: dict | None,
    after: dict | None,
) -> None:
    """`entry` 是 (帳目 id, 記帳人 id)。"""
    entry_id, owner_id = entry
    await WalletEntryLogTable.create(
        data={
            "wallet_id": access.wallet["id"],
            "entry_id": entry_id,
            "action": action,
            "actor_id": current_user["id"],
            "as_super_admin": as_super_admin(access, owner_id, current_user),
            "before": before,
            "after": after,
        }
    )


async def totals_by_person(wallet_id: str) -> list[tuple[str, MemberTotals]]:
    """所有成員依加入順序, 後面接著已經離開、但有紀錄的人。

    有紀錄的人在結帳前不能離開, 結帳後可以 (見 docs/features/travel-wallet.md〈封存〉),
    金額照樣要算進去。
    """
    member_ids = [member["user_id"] for member in await WalletMemberTable.list_members(wallet_id)]
    totals = await TravelExpenseTable.totals(wallet_id)
    members = set(member_ids)
    people = [*member_ids, *(user_id for user_id in totals if user_id not in members)]
    return [(user_id, totals.get(user_id, {"paid": 0, "owed": 0})) for user_id in people]


async def net_amounts(wallet_id: str) -> list[tuple[str, int]]:
    """每人的淨額, 順序同 `totals_by_person`。給結算算清償方案。"""
    return [(user_id, t["paid"] - t["owed"]) for user_id, t in await totals_by_person(wallet_id)]
