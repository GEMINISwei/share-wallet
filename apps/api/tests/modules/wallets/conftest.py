"""wallets 的單元測試共用: 一份記憶體裡的資料表, 換掉 model 的查詢與寫入方法。

被測的是 service 與授權的判斷; 查詢本身對不對 (join、cascade、部分唯一索引) 在
`test_model.py` 對真的 PostgreSQL 驗。
"""

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

import pytest

from modules.wallets import admin as admin_service
from modules.wallets import members as member_service
from modules.wallets.model import (
    CategoryType,
    MemberRole,
    WalletCategoryTable,
    WalletKind,
    WalletMemberTable,
    WalletTable,
)

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
    locked: list[str] = field(default_factory=list)

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

    async def find_nicknames(user_ids):
        by_id = {info["id"]: info["nickname"] for info in USERS.values()}
        return {uid: by_id[uid] for uid in user_ids if uid in by_id}

    for name, fake in {
        "create": create,
        "find_role": find_role,
        "list_members": list_members,
        "count_admins": count_admins,
        "set_role": set_role,
        "remove": remove,
    }.items():
        monkeypatch.setattr(WalletMemberTable, name, fake)
    monkeypatch.setattr(member_service, "find_nicknames", find_nicknames)
    monkeypatch.setattr(admin_service, "find_nicknames", find_nicknames)


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


@pytest.fixture
def store(monkeypatch: pytest.MonkeyPatch) -> FakeStore:
    fake = FakeStore()
    _install_wallets(monkeypatch, fake)
    _install_members(monkeypatch, fake)
    _install_admin(monkeypatch, fake)
    _install_categories(monkeypatch, fake)
    return fake


@pytest.fixture(autouse=True)
def _current_users(set_current_users):
    set_current_users(USERS)
