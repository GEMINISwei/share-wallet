"""wallets 的單元測試共用: 一份記憶體裡的資料表, 換掉 model 的查詢與寫入方法。

被測的是 service 與授權的判斷; 查詢本身對不對 (join、cascade、部分唯一索引) 在
`test_model.py` 對真的 PostgreSQL 驗。
"""

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any

import pytest

from modules.wallets import admin as admin_service
from modules.wallets import entries as entry_service
from modules.wallets import entry_logs as entry_log_service
from modules.wallets import invites as invite_service
from modules.wallets import members as member_service
from modules.wallets.model import (
    CategoryType,
    EntryKind,
    MemberRole,
    WalletCategoryTable,
    WalletEntryLogTable,
    WalletEntryTable,
    WalletInviteTable,
    WalletKind,
    WalletMemberTable,
    WalletTable,
)
from shared.http.errors import NoChangeError

ALICE = str(uuid.uuid4())
BOB = str(uuid.uuid4())
CAROL = str(uuid.uuid4())
SUPER = str(uuid.uuid4())
DAVE = str(uuid.uuid4())

USERS = {
    "alice": {"id": ALICE, "nickname": "Alice", "permissions": [], "is_disabled": False},
    "bob": {"id": BOB, "nickname": "Bob", "permissions": [], "is_disabled": False},
    "carol": {"id": CAROL, "nickname": "Carol", "permissions": [], "is_disabled": False},
    "super": {"id": SUPER, "nickname": "Super", "permissions": ["*"], "is_disabled": False},
    "dave": {"id": DAVE, "nickname": "Dave", "permissions": [], "is_disabled": True},
}


def user(name: str) -> Any:
    """service 收的 `CurrentUser`。"""
    return {"username": name, "auth_version": 1, **USERS[name]}


@dataclass
class FakeStore:
    wallets: dict[str, dict] = field(default_factory=dict)
    # 依加入順序 (dict 保留插入順序)。
    members: dict[tuple[str, str], MemberRole] = field(default_factory=dict)
    categories: dict[str, dict] = field(default_factory=dict)
    # wallet_id → 邀請 (每個錢包最多一條)。
    invites: dict[str, dict] = field(default_factory=dict)
    locked: list[str] = field(default_factory=list)
    entries: dict[str, dict] = field(default_factory=dict)
    #: 寫入的順序。
    logs: list[dict] = field(default_factory=list)
    #: invites.py 看到的「現在」, 測試改它來模擬過期。
    now: datetime = datetime(2026, 10, 18, 12, 0)

    def add_wallet(
        self,
        kind: WalletKind = WalletKind.GENERAL,
        name: str = "家用",
        balance: int = 0,
        members: dict[str, MemberRole] | None = None,
    ) -> str:
        id = str(uuid.uuid4())
        travel = kind is WalletKind.TRAVEL
        self.wallets[id] = {
            "id": id,
            "kind": kind,
            "name": name,
            "balance": balance,
            "destination": "東京" if travel else None,
            "start_date": date(2026, 11, 1) if travel else None,
            "end_date": date(2026, 11, 5) if travel else None,
            "created_at": datetime(2026, 10, 17),
        }
        for user_id, role in (members or {ALICE: MemberRole.ADMIN}).items():
            self.members[(id, user_id)] = role
        return id

    def add_category(
        self,
        wallet_id: str,
        name: str,
        category_type: CategoryType = CategoryType.EXPENSE,
        archived: bool = False,
    ) -> str:
        id = str(uuid.uuid4())
        self.categories[id] = {
            "id": id,
            "wallet_id": wallet_id,
            "type": category_type,
            "name": name,
            "archived_at": datetime(2026, 10, 17) if archived else None,
        }
        return id

    def add_entry(
        self,
        wallet_id: str,
        created_by: str,
        kind: EntryKind = EntryKind.EXPENSE,
        amount: int = 100,
        category_id: str | None = None,
        entry_date: date = date(2026, 10, 18),
        note: str = "",
        transfer_id: str | None = None,
        counterpart_wallet_id: str | None = None,
    ) -> str:
        """直接放一筆帳 (不經過 service, 所以不動餘額、不留紀錄)。"""
        id = str(uuid.uuid4())
        self.entries[id] = {
            "id": id,
            "wallet_id": wallet_id,
            "kind": kind,
            "amount": amount,
            "category_id": category_id,
            "entry_date": entry_date,
            "note": note,
            "transfer_id": transfer_id,
            "counterpart_wallet_id": counterpart_wallet_id,
            "created_by": created_by,
            "created_at": datetime(2026, 10, 18) + timedelta(seconds=len(self.entries)),
        }
        return id

    def entry_detail(self, id: str) -> dict:
        entry = self.entries[id]
        category = self.categories.get(entry["category_id"] or "")
        counterpart = self.wallets.get(entry["counterpart_wallet_id"] or "")
        return {
            **entry,
            "category_name": None if category is None else category["name"],
            "counterpart_wallet_name": None if counterpart is None else counterpart["name"],
        }

    def delete_wallet(self, wallet_id: str) -> None:
        """模擬資料庫刪錢包: 這個錢包的帳一起刪, 別的錢包記著它的轉帳變成對方 NULL。"""
        del self.wallets[wallet_id]
        self.members = {key: role for key, role in self.members.items() if key[0] != wallet_id}
        self.entries = {
            id: entry for id, entry in self.entries.items() if entry["wallet_id"] != wallet_id
        }
        for entry in self.entries.values():
            if entry["counterpart_wallet_id"] == wallet_id:
                entry["counterpart_wallet_id"] = None

    def balance(self, wallet_id: str) -> int:
        return self.wallets[wallet_id]["balance"]

    def active_categories(self, wallet_id: str) -> list[dict]:
        return [
            category
            for category in self.categories.values()
            if category["wallet_id"] == wallet_id and category["archived_at"] is None
        ]

    def roles(self, wallet_id: str) -> dict[str, MemberRole]:
        return {uid: role for (wid, uid), role in self.members.items() if wid == wallet_id}


def _install_wallets(monkeypatch: pytest.MonkeyPatch, store: FakeStore) -> None:
    async def find_detail_by_id(id, session=None):
        return store.wallets.get(id)

    async def create(data, session=None):
        id = str(uuid.uuid4())
        store.wallets[id] = {
            "id": id,
            "balance": 0,
            "destination": None,
            "start_date": None,
            "end_date": None,
            "created_at": datetime(2026, 10, 17),
            **data,
        }
        return {"id": id}

    async def update_by_id(id, data=None, session=None, *, also_changed=False):
        if id not in store.wallets:
            return None
        store.wallets[id].update(data or {})
        return {"id": id}

    async def delete_by_id(id):
        if store.wallets.pop(id, None) is None:
            return False
        store.members = {key: role for key, role in store.members.items() if key[0] != id}
        store.invites.pop(id, None)
        return True

    async def find_joined(user_id):
        return [
            {"wallet": store.wallets[wid], "role": role}
            for (wid, uid), role in store.members.items()
            if uid == user_id
        ]

    async def lock_by_id(id, session=None):
        store.locked.append(id)

    for name, fake in {
        "find_detail_by_id": find_detail_by_id,
        "create": create,
        "update_by_id": update_by_id,
        "delete_by_id": delete_by_id,
        "find_joined": find_joined,
        "lock_by_id": lock_by_id,
    }.items():
        monkeypatch.setattr(WalletTable, name, fake)


async def _find_nicknames(user_ids):
    by_id = {info["id"]: info["nickname"] for info in USERS.values()}
    return {uid: by_id[uid] for uid in user_ids if uid in by_id}


def _install_members(monkeypatch: pytest.MonkeyPatch, store: FakeStore) -> None:
    async def create(data, session=None):
        store.members[(data["wallet_id"], data["user_id"])] = MemberRole(data["role"])
        return {"id": str(uuid.uuid4())}

    async def find_role(wallet_id, user_id):
        return store.members.get((wallet_id, user_id))

    async def list_members(wallet_id):
        return [{"user_id": uid, "role": role} for uid, role in store.roles(wallet_id).items()]

    async def count_admins(wallet_id):
        return sum(role is MemberRole.ADMIN for role in store.roles(wallet_id).values())

    async def set_role(wallet_id, user_id, role):
        store.members[(wallet_id, user_id)] = role

    async def remove(wallet_id, user_id):
        store.members.pop((wallet_id, user_id), None)

    async def add_if_absent(wallet_id, user_id, role):
        store.members.setdefault((wallet_id, user_id), role)

    for name, fake in {
        "create": create,
        "find_role": find_role,
        "list_members": list_members,
        "count_admins": count_admins,
        "set_role": set_role,
        "remove": remove,
        "add_if_absent": add_if_absent,
    }.items():
        monkeypatch.setattr(WalletMemberTable, name, fake)
    for service in (member_service, entry_service, entry_log_service):
        monkeypatch.setattr(service, "find_nicknames", _find_nicknames)
    monkeypatch.setattr(admin_service, "find_nicknames", _find_nicknames)


def _install_admin(monkeypatch: pytest.MonkeyPatch, store: FakeStore) -> None:
    """後台用到的查詢: 所有錢包的一頁、一次取多個錢包的成員、帳號是否啟用。"""

    async def find_page(limit, cursor=None, direction="next", name=None, kind=None):
        # 篩選與分頁的 SQL 在 test_model.py 驗, 這裡只照順序回傳全部。
        wallets = list(store.wallets.values())
        return {
            "list_data": wallets,
            "has_next": False,
            "has_previous": False,
            "total_count": len(wallets),
        }

    async def list_by_wallets(wallet_ids):
        return {
            wid: [{"user_id": uid, "role": role} for uid, role in store.roles(wid).items()]
            for wid in wallet_ids
        }

    async def is_active_user(user_id):
        return any(info["id"] == user_id and not info["is_disabled"] for info in USERS.values())

    monkeypatch.setattr(WalletTable, "find_page", find_page)
    monkeypatch.setattr(WalletMemberTable, "list_by_wallets", list_by_wallets)
    monkeypatch.setattr(admin_service, "is_active_user", is_active_user)


def _install_categories(monkeypatch: pytest.MonkeyPatch, store: FakeStore) -> None:
    async def create_many(wallet_id, items):
        for category_type, name in items:
            store.add_category(wallet_id, name, category_type)

    async def create(data, session=None):
        return {"id": store.add_category(data["wallet_id"], data["name"], data["type"])}

    async def list_active(wallet_id):
        return store.active_categories(wallet_id)

    async def find_detail_active(wallet_id, id):
        found = store.categories.get(id)
        if found is None or found["wallet_id"] != wallet_id or found["archived_at"] is not None:
            return None
        return found

    async def name_taken(wallet_id, category_type, name, exclude_id=None):
        return any(
            category["type"] == category_type
            and category["name"] == name
            and category["id"] != exclude_id
            for category in store.active_categories(wallet_id)
        )

    async def update_by_id(id, data=None, session=None, *, also_changed=False):
        store.categories[id].update(data or {})
        return {"id": id}

    for name, fake in {
        "create_many": create_many,
        "create": create,
        "list_active": list_active,
        "find_detail_active": find_detail_active,
        "name_taken": name_taken,
        "update_by_id": update_by_id,
    }.items():
        monkeypatch.setattr(WalletCategoryTable, name, fake)


def _install_invites(monkeypatch: pytest.MonkeyPatch, store: FakeStore) -> None:
    async def find_detail_by_wallet(wallet_id):
        return store.invites.get(wallet_id)

    async def find_detail_by_token(token):
        return next((i for i in store.invites.values() if i["token"] == token), None)

    async def replace(wallet_id, token, expires_at):
        store.invites[wallet_id] = {
            "wallet_id": wallet_id,
            "token": token,
            "expires_at": expires_at,
        }

    async def remove(wallet_id):
        store.invites.pop(wallet_id, None)

    for name, fake in {
        "find_detail_by_wallet": find_detail_by_wallet,
        "find_detail_by_token": find_detail_by_token,
        "replace": replace,
        "remove": remove,
    }.items():
        monkeypatch.setattr(WalletInviteTable, name, fake)
    monkeypatch.setattr(invite_service, "utc_now", lambda: store.now)


def _install_ledger_lookups(monkeypatch: pytest.MonkeyPatch, store: FakeStore) -> None:
    """記帳時才用到的錢包與分類查詢: 鎖住並讀餘額、寫回餘額、含封存的分類。"""

    async def lock_balance(id):
        store.locked.append(id)
        wallet = store.wallets.get(id)
        return None if wallet is None else wallet["balance"]

    async def set_balance(id, balance):
        store.wallets[id]["balance"] = balance

    async def find_category(wallet_id, id):
        found = store.categories.get(id)
        return found if found is not None and found["wallet_id"] == wallet_id else None

    monkeypatch.setattr(WalletTable, "lock_balance", lock_balance)
    monkeypatch.setattr(WalletTable, "set_balance", set_balance)
    monkeypatch.setattr(WalletCategoryTable, "find_detail_in_wallet", find_category)


def _install_entries(monkeypatch: pytest.MonkeyPatch, store: FakeStore) -> None:
    async def create(data, session=None):
        id = store.add_entry(**data)
        return {"id": id, "created_at": store.entries[id]["created_at"]}

    async def find_detail_in_wallet(wallet_id, id):
        found = store.entries.get(id)
        if found is None or found["wallet_id"] != wallet_id:
            return None
        return store.entry_detail(id)

    async def update_by_id(id, data=None, session=None, *, also_changed=False):
        entry = store.entries[id]
        if all(entry[key] == value for key, value in (data or {}).items()):
            raise NoChangeError()
        entry.update(data or {})
        return {"id": id}

    async def delete_in_wallet(wallet_id, id):
        if store.entries.get(id, {}).get("wallet_id") == wallet_id:
            del store.entries[id]

    async def find_page(wallet_id, limit, cursor=None):
        # 排序與游標的 SQL 在 test_model.py 驗, 這裡只照日期新到舊回傳全部。
        rows = [
            store.entry_detail(id) for id, e in store.entries.items() if e["wallet_id"] == wallet_id
        ]
        rows.sort(key=lambda e: (e["entry_date"], e["created_at"]), reverse=True)
        return {"list_data": rows, "next_cursor": None}

    for name, fake in {
        "create": create,
        "find_detail_in_wallet": find_detail_in_wallet,
        "update_by_id": update_by_id,
        "delete_in_wallet": delete_in_wallet,
        "find_page": find_page,
    }.items():
        monkeypatch.setattr(WalletEntryTable, name, fake)


def _install_transfers(monkeypatch: pytest.MonkeyPatch, store: FakeStore) -> None:
    """轉帳才用到的帳目查詢: 對方錢包、某個錢包裡的那一邊。"""

    async def find_counterpart_wallet_id(wallet_id, id):
        found = store.entries.get(id)
        if found is None or found["wallet_id"] != wallet_id:
            return None
        return found["counterpart_wallet_id"]

    async def find_transfer_in_wallet(wallet_id, transfer_id):
        return next(
            (
                store.entry_detail(id)
                for id, e in store.entries.items()
                if e["wallet_id"] == wallet_id and e["transfer_id"] == transfer_id
            ),
            None,
        )

    monkeypatch.setattr(WalletEntryTable, "find_counterpart_wallet_id", find_counterpart_wallet_id)
    monkeypatch.setattr(WalletEntryTable, "find_transfer_in_wallet", find_transfer_in_wallet)


def _install_entry_logs(monkeypatch: pytest.MonkeyPatch, store: FakeStore) -> None:
    async def create_log(data, session=None):
        log = {"id": str(uuid.uuid4()), "created_at": store.now, **data}
        store.logs.append(log)
        return log

    def _log_details(wallet_id):
        return [log for log in reversed(store.logs) if log["wallet_id"] == wallet_id]

    async def list_for_entry(wallet_id, entry_id):
        return [log for log in _log_details(wallet_id) if log["entry_id"] == entry_id]

    async def find_log_page(wallet_id, limit, cursor=None):
        return {"list_data": _log_details(wallet_id), "next_cursor": None}

    for name, fake in {
        "create": create_log,
        "list_for_entry": list_for_entry,
        "find_page": find_log_page,
    }.items():
        monkeypatch.setattr(WalletEntryLogTable, name, fake)


@pytest.fixture
def store(monkeypatch: pytest.MonkeyPatch) -> FakeStore:
    fake = FakeStore()
    _install_wallets(monkeypatch, fake)
    _install_members(monkeypatch, fake)
    _install_admin(monkeypatch, fake)
    _install_categories(monkeypatch, fake)
    _install_invites(monkeypatch, fake)
    _install_ledger_lookups(monkeypatch, fake)
    _install_entries(monkeypatch, fake)
    _install_transfers(monkeypatch, fake)
    _install_entry_logs(monkeypatch, fake)
    return fake


@pytest.fixture(autouse=True)
def _current_users(set_current_users):
    set_current_users(USERS)
