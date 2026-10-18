"""一般錢包的帳目: 收入、支出與調整餘額。

餘額是存起來的值 (見 docs/features.md〈餘額〉): 每個寫入都先 `WalletTable.lock_balance` 鎖住
錢包, 再在同一個請求的交易裡改帳目、改餘額、留異動紀錄 —— 任何一步丟出例外時 middleware
整批回滾, 三者不會只寫進一部分。異動紀錄的讀取在 `entry_logs.py`。
"""

from datetime import date

from modules.users.public import find_nicknames
from shared.auth.contracts import CurrentUser
from shared.http.errors import LangException

from .access import WalletAccess, is_super_admin, open_wallet
from .errors import WalletError
from .model import (
    EntryDetail,
    EntryKind,
    EntryLogAction,
    MemberRole,
    WalletCategoryTable,
    WalletEntryLogTable,
    WalletEntryTable,
    WalletKind,
    WalletTable,
)
from .schema import (
    MAX_SAFE_AMOUNT,
    BalanceAdjust,
    EntryCategory,
    EntryCreate,
    EntryInfo,
    EntryOperate,
    EntryPage,
    EntrySnapshot,
    EntryUpdate,
    EntryUser,
)


def balance_effect(kind: EntryKind, amount: int) -> int:
    """這筆帳讓餘額變多少。調整的 `amount` 本身就是帶正負號的差額。"""
    return -amount if kind is EntryKind.EXPENSE else amount


async def open_general_wallet(wallet_id: str, current_user: CurrentUser) -> WalletAccess:
    access = await open_wallet(wallet_id, current_user)
    # 旅遊錢包記的是誰付了、誰分攤, 不是收支 (見 docs/features.md〈旅遊錢包〉)。
    if access.wallet["kind"] != WalletKind.GENERAL:
        raise LangException(400, WalletError.NOT_GENERAL)
    return access


def _as_super_admin(access: WalletAccess, owner_id: str, current_user: CurrentUser) -> bool:
    """這次操作是不是靠超管身分才做得到 (見 docs/features.md〈紀錄〉)。"""
    if not is_super_admin(current_user):
        return False
    if access.role is None:
        return True
    return owner_id != current_user["id"] and access.role is not MemberRole.ADMIN


async def _locked_balance(wallet_id: str) -> int:
    balance = await WalletTable.lock_balance(wallet_id)
    if balance is None:
        raise LangException(404, WalletError.NOT_FOUND)
    return balance


def _checked_balance(balance: int) -> int:
    # 超過這個值送到瀏覽器就會失真 (見 schema.py 的 MAX_SAFE_AMOUNT), 而且不會有任何錯誤。
    if abs(balance) > MAX_SAFE_AMOUNT:
        raise LangException(400, WalletError.BALANCE_OUT_OF_RANGE)
    return balance


async def _category_name(wallet_id: str, form_data: EntryCreate, keep_id: str | None) -> str:
    """選的分類要在這個錢包、類型對、沒有封存; 唯一的例外是修改時保留原本的分類。"""
    category = await WalletCategoryTable.find_detail_in_wallet(wallet_id, form_data.category_id)
    archived = category is not None and category["archived_at"] is not None
    if category is None or (archived and form_data.category_id != keep_id):
        raise LangException(404, WalletError.CATEGORY_NOT_FOUND)
    if category["type"] != form_data.kind:
        raise LangException(400, WalletError.CATEGORY_TYPE_MISMATCH)
    return category["name"]


def _snapshot(entry: EntryDetail) -> dict:
    return _snapshot_of(
        entry["kind"], entry["amount"], entry["category_name"], entry["entry_date"], entry["note"]
    )


def _snapshot_of(
    kind: EntryKind, amount: int, category_name: str | None, entry_date: date, note: str
) -> dict:
    return EntrySnapshot(
        kind=kind, amount=amount, category_name=category_name, entry_date=entry_date, note=note
    ).model_dump(mode="json")


async def _log(
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
            "as_super_admin": _as_super_admin(access, owner_id, current_user),
            "before": before,
            "after": after,
        }
    )


async def _modifiable_entry(
    access: WalletAccess, entry_id: str, current_user: CurrentUser
) -> EntryDetail:
    """自己記的帳, 或管理者 (含超級管理者) 改任何人的帳。"""
    entry = await WalletEntryTable.find_detail_in_wallet(access.wallet["id"], entry_id)
    if entry is None:
        raise LangException(404, WalletError.ENTRY_NOT_FOUND)
    if entry["created_by"] != current_user["id"] and not access.can_manage:
        raise LangException(403, WalletError.NOT_ENTRY_OWNER)
    return entry


async def create_entry(
    wallet_id: str, form_data: EntryCreate, current_user: CurrentUser
) -> EntryOperate:
    access = await open_general_wallet(wallet_id, current_user)
    balance = await _locked_balance(wallet_id)
    category_name = await _category_name(wallet_id, form_data, keep_id=None)
    new_balance = _checked_balance(balance + balance_effect(form_data.kind, form_data.amount))

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
    after = _snapshot_of(
        form_data.kind, form_data.amount, category_name, form_data.entry_date, form_data.note
    )
    await _log(
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
    difference = form_data.balance - await _locked_balance(wallet_id)
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
    after = _snapshot_of(
        EntryKind.ADJUSTMENT, difference, None, form_data.entry_date, form_data.note
    )
    await _log(
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
    balance = await _locked_balance(wallet_id)
    entry = await _modifiable_entry(access, entry_id, current_user)
    if entry["kind"] is EntryKind.ADJUSTMENT:
        raise LangException(400, WalletError.ADJUSTMENT_IMMUTABLE)
    category_name = await _category_name(wallet_id, form_data, keep_id=entry["category_id"])
    delta = balance_effect(form_data.kind, form_data.amount) - balance_effect(
        entry["kind"], entry["amount"]
    )
    new_balance = _checked_balance(balance + delta)

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
    after = _snapshot_of(
        form_data.kind, form_data.amount, category_name, form_data.entry_date, form_data.note
    )
    await _log(
        access,
        current_user,
        (entry_id, entry["created_by"]),
        EntryLogAction.UPDATE,
        _snapshot(entry),
        after,
    )
    return EntryOperate(id=entry_id)


async def delete_entry(wallet_id: str, entry_id: str, current_user: CurrentUser) -> EntryOperate:
    """反向套用這筆帳; 調整也可以刪 (見 docs/features.md〈餘額〉)。"""
    access = await open_general_wallet(wallet_id, current_user)
    balance = await _locked_balance(wallet_id)
    entry = await _modifiable_entry(access, entry_id, current_user)
    new_balance = _checked_balance(balance - balance_effect(entry["kind"], entry["amount"]))

    await WalletEntryTable.delete_in_wallet(wallet_id, entry_id)
    await WalletTable.set_balance(wallet_id, new_balance)
    await _log(
        access,
        current_user,
        (entry_id, entry["created_by"]),
        EntryLogAction.DELETE,
        _snapshot(entry),
        None,
    )
    return EntryOperate(id=entry_id)


async def list_entries(
    wallet_id: str, current_user: CurrentUser, limit: int, cursor: str | None = None
) -> EntryPage:
    await open_general_wallet(wallet_id, current_user)
    page = await WalletEntryTable.find_page(wallet_id, limit=limit, cursor=cursor)
    nicknames = await find_nicknames(list({entry["created_by"] for entry in page["list_data"]}))
    items = [
        EntryInfo(
            id=entry["id"],
            kind=entry["kind"],
            amount=entry["amount"],
            category=(
                None
                if entry["category_id"] is None
                else EntryCategory(id=entry["category_id"], name=entry["category_name"] or "")
            ),
            entry_date=entry["entry_date"],
            note=entry["note"],
            created_by=EntryUser(
                user_id=entry["created_by"], nickname=nicknames.get(entry["created_by"], "")
            ),
            created_at=entry["created_at"],
        )
        for entry in page["list_data"]
    ]
    return EntryPage(list_data=items, next_cursor=page["next_cursor"])
