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
from modules.wallets import expenses as expense_service
from modules.wallets import invites as invite_service
from modules.wallets import members as member_service
from modules.wallets import settlement as settlement_service
from modules.wallets.model import (
    CategoryType,
    EntryKind,
    MemberRole,
    SplitMode,
    TravelExpenseTable,
    TravelSettlementTransferTable,
    WalletAdvanceTargetTable,
    WalletCategoryTable,
    WalletEntryLogTable,
    WalletEntryTable,
    WalletGroupTable,
    WalletInviteTable,
    WalletKind,
    WalletMemberTable,
    WalletStatus,
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
    #: 設為最愛的 (wallet_id, user_id), 跟著成員紀錄存亡。
    favorites: set[tuple[str, str]] = field(default_factory=set)
    #: 錢包群組, id → {id, user_id, kind, name, is_default, position}; 依建立順序。
    groups: dict[str, dict] = field(default_factory=dict)
    #: 成員紀錄上的群組與顯示, (wallet_id, user_id) → {group_id, is_hidden}。
    placements: dict[tuple[str, str], dict] = field(default_factory=dict)
    categories: dict[str, dict] = field(default_factory=dict)
    # wallet_id → 邀請 (每個錢包最多一條)。
    invites: dict[str, dict] = field(default_factory=dict)
    locked: list[str] = field(default_factory=list)
    entries: dict[str, dict] = field(default_factory=dict)
    #: 代墊對象, id → {id, wallet_id, name, outstanding}。
    targets: dict[str, dict] = field(default_factory=dict)
    #: 寫入的順序。
    logs: list[dict] = field(default_factory=list)
    #: 旅遊錢包的帳, id → {..., shares: [{user_id, amount}]} (shares 依存進來的順序)。
    expenses: dict[str, dict] = field(default_factory=dict)
    #: 清償方案的轉帳, id → {..., position}; 依存進來的順序。
    settlements: dict[str, dict] = field(default_factory=dict)
    #: invites.py 看到的「現在」, 測試改它來模擬過期。
    now: datetime = datetime(2026, 10, 18, 12, 0)

    def add_wallet(
        self,
        kind: WalletKind = WalletKind.GENERAL,
        name: str = "家用",
        balance: int = 0,
        members: dict[str, MemberRole] | None = None,
        status: WalletStatus = WalletStatus.ACTIVE,
    ) -> str:
        id = str(uuid.uuid4())
        travel = kind is WalletKind.TRAVEL
        self.wallets[id] = {
            "id": id,
            "kind": kind,
            "name": name,
            "status": status,
            "balance": balance,
            "destination": "東京" if travel else None,
            "start_date": date(2026, 11, 1) if travel else None,
            "end_date": date(2026, 11, 5) if travel else None,
            "created_at": datetime(2026, 10, 17),
        }
        for user_id, role in (members or {ALICE: MemberRole.ADMIN}).items():
            self.members[(id, user_id)] = role
            self.placements[(id, user_id)] = {
                "group_id": self.default_group(user_id, kind),
                "is_hidden": False,
            }
        return id

    def ensure_defaults(self, user_id: str) -> None:
        """比照 `WalletGroupTable.ensure_defaults`: 兩種類型各一個預設群組, 已經有就不動。"""
        for kind in WalletKind:
            if not any(
                g["user_id"] == user_id and g["kind"] == kind and g["is_default"]
                for g in self.groups.values()
            ):
                id = str(uuid.uuid4())
                self.groups[id] = {
                    "id": id,
                    "user_id": user_id,
                    "kind": kind,
                    "name": None,
                    "is_default": True,
                    "position": 0,
                }

    def default_group(self, user_id: str, kind: WalletKind = WalletKind.GENERAL) -> str:
        self.ensure_defaults(user_id)
        return next(
            g["id"]
            for g in self.groups.values()
            if g["user_id"] == user_id and g["kind"] == kind and g["is_default"]
        )

    def add_group(
        self, user_id: str, name: str, kind: WalletKind = WalletKind.GENERAL
    ) -> str:
        """直接放一個自訂群組, 排在同類型的最後 (不經過 service, 所以不重新編號)。"""
        self.ensure_defaults(user_id)
        id = str(uuid.uuid4())
        self.groups[id] = {
            "id": id,
            "user_id": user_id,
            "kind": kind,
            "name": name,
            "is_default": False,
            "position": len(self.groups_of(user_id, kind)),
        }
        return id

    def groups_of(self, user_id: str, kind: WalletKind) -> list[dict]:
        """一個人某種類型的群組, 依顯示順序。"""
        found = [g for g in self.groups.values() if g["user_id"] == user_id and g["kind"] == kind]
        return sorted(found, key=lambda g: g["position"])

    def group_order(self, user_id: str, kind: WalletKind = WalletKind.GENERAL) -> list[str | None]:
        """群組的名稱依顯示順序, 預設群組是 None。"""
        return [g["name"] for g in self.groups_of(user_id, kind)]

    def placement(self, wallet_id: str, user_id: str) -> dict:
        return self.placements[(wallet_id, user_id)]

    def join(self, wallet_id: str, user_id: str, role: MemberRole, group_id: str) -> None:
        """比照 `add_if_absent`: 已經是成員時角色與群組都不變。"""
        key = (wallet_id, user_id)
        self.members.setdefault(key, role)
        self.placements.setdefault(key, {"group_id": group_id, "is_hidden": False})

    def leave(self, wallet_id: str, user_id: str) -> None:
        """刪掉成員紀錄, 最愛、群組與顯示跟著消失。"""
        self.members.pop((wallet_id, user_id), None)
        self.favorites.discard((wallet_id, user_id))
        self.placements.pop((wallet_id, user_id), None)

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
        advance_target_id: str | None = None,
        advance_id: str | None = None,
        outstanding: int | None = None,
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
            "advance_target_id": advance_target_id,
            "advance_id": advance_id,
            "outstanding": outstanding,
            "created_by": created_by,
            "created_at": datetime(2026, 10, 18) + timedelta(seconds=len(self.entries)),
        }
        return id

    def target(self, wallet_id: str, name: str) -> dict:
        """取得或建立代墊對象 (比照 `WalletAdvanceTargetTable.find_or_create`)。"""
        for found in self.targets.values():
            if found["wallet_id"] == wallet_id and found["name"] == name:
                return found
        id = str(uuid.uuid4())
        self.targets[id] = {"id": id, "wallet_id": wallet_id, "name": name, "outstanding": 0}
        return self.targets[id]

    def add_advance(
        self,
        wallet_id: str,
        created_by: str,
        target_name: str = "小明",
        amount: int = 500,
        outstanding: int | None = None,
    ) -> str:
        """直接放一筆代墊, 對象的未還金額一起加上 (不動餘額、不留紀錄)。"""
        left = amount if outstanding is None else outstanding
        target = self.target(wallet_id, target_name)
        target["outstanding"] += left
        return self.add_entry(
            wallet_id,
            created_by,
            kind=EntryKind.ADVANCE,
            amount=amount,
            advance_target_id=target["id"],
            outstanding=left,
        )

    def add_repayment(self, wallet_id: str, created_by: str, advance_id: str, amount: int) -> str:
        """直接放一筆還款, 不動任何金額: 搭配 `add_advance(outstanding=...)` 使用。"""
        return self.add_entry(
            wallet_id,
            created_by,
            kind=EntryKind.REPAYMENT,
            amount=amount,
            advance_target_id=self.entries[advance_id]["advance_target_id"],
            advance_id=advance_id,
        )

    def add_expense(
        self,
        wallet_id: str,
        created_by: str,
        payer_id: str,
        shares: dict[str, int],
        split_mode: SplitMode = SplitMode.CUSTOM,
        entry_date: date = date(2026, 11, 2),
        note: str = "",
    ) -> str:
        """直接放一筆旅遊錢包的帳 (不經過 service, 所以不留紀錄)。金額是分攤的加總。"""
        id = str(uuid.uuid4())
        self.expenses[id] = {
            "id": id,
            "wallet_id": wallet_id,
            "amount": sum(shares.values()),
            "payer_id": payer_id,
            "split_mode": split_mode,
            "entry_date": entry_date,
            "note": note,
            "created_by": created_by,
            "created_at": datetime(2026, 11, 2) + timedelta(seconds=len(self.expenses)),
            "shares": [{"user_id": uid, "amount": amount} for uid, amount in shares.items()],
        }
        return id

    def add_settlement(
        self,
        wallet_id: str,
        from_user_id: str,
        to_user_id: str,
        amount: int,
        paid: bool = False,
        confirmed_by: str | None = None,
    ) -> str:
        """直接放清償方案的一筆 (不經過 service, 錢包的狀態要另外給)。"""
        id = str(uuid.uuid4())
        self.settlements[id] = {
            "id": id,
            "wallet_id": wallet_id,
            "position": len(self.transfers_of(wallet_id)),
            "from_user_id": from_user_id,
            "to_user_id": to_user_id,
            "amount": amount,
            "paid_at": self.now if paid else None,
            "confirmed_at": self.now if confirmed_by else None,
            "confirmed_by": confirmed_by,
        }
        return id

    def transfers_of(self, wallet_id: str) -> list[dict]:
        """一個錢包的清償方案, 依方案的順序。"""
        found = [t for t in self.settlements.values() if t["wallet_id"] == wallet_id]
        return sorted(found, key=lambda t: t["position"])

    def status(self, wallet_id: str) -> WalletStatus:
        return self.wallets[wallet_id]["status"]

    def shares_of(self, expense_id: str) -> dict[str, int]:
        """一筆帳的分攤, 依存進來的順序。"""
        return {share["user_id"]: share["amount"] for share in self.expenses[expense_id]["shares"]}

    def outstanding_of(self, wallet_id: str, name: str) -> int:
        return self.target(wallet_id, name)["outstanding"]

    def entry_detail(self, id: str) -> dict:
        entry = self.entries[id]
        category = self.categories.get(entry["category_id"] or "")
        counterpart = self.wallets.get(entry["counterpart_wallet_id"] or "")
        target = self.targets.get(entry["advance_target_id"] or "")
        return {
            **entry,
            "category_name": None if category is None else category["name"],
            "counterpart_wallet_name": None if counterpart is None else counterpart["name"],
            "advance_target_name": None if target is None else target["name"],
        }

    def delete_wallet(self, wallet_id: str) -> None:
        """模擬資料庫刪錢包: 這個錢包的帳一起刪, 別的錢包記著它的轉帳變成對方 NULL。"""
        del self.wallets[wallet_id]
        self.members = {key: role for key, role in self.members.items() if key[0] != wallet_id}
        self.placements = {
            key: value for key, value in self.placements.items() if key[0] != wallet_id
        }
        self.entries = {
            id: entry for id, entry in self.entries.items() if entry["wallet_id"] != wallet_id
        }
        self.targets = {
            id: target for id, target in self.targets.items() if target["wallet_id"] != wallet_id
        }
        self.expenses = {
            id: expense
            for id, expense in self.expenses.items()
            if expense["wallet_id"] != wallet_id
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
            "status": WalletStatus.ACTIVE,
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
        store.placements = {
            key: value for key, value in store.placements.items() if key[0] != id
        }
        store.invites.pop(id, None)
        return True

    async def find_joined(user_id):
        return [
            {
                "wallet": store.wallets[wid],
                "role": role,
                "is_favorite": (wid, uid) in store.favorites,
                "group_id": store.placements[(wid, uid)]["group_id"],
                "is_hidden": store.placements[(wid, uid)]["is_hidden"],
            }
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


def _install_wallet_status(monkeypatch: pytest.MonkeyPatch, store: FakeStore) -> None:
    """鎖住並讀出結算狀態、寫回狀態。"""

    async def lock_status(id):
        store.locked.append(id)
        wallet = store.wallets.get(id)
        return None if wallet is None else wallet["status"]

    async def set_status(id, status):
        store.wallets[id]["status"] = status

    monkeypatch.setattr(WalletTable, "lock_status", lock_status)
    monkeypatch.setattr(WalletTable, "set_status", set_status)


async def _find_nicknames(user_ids):
    by_id = {info["id"]: info["nickname"] for info in USERS.values()}
    return {uid: by_id[uid] for uid in user_ids if uid in by_id}


def _install_favorites(monkeypatch: pytest.MonkeyPatch, store: FakeStore) -> None:
    async def find_favorite(wallet_id, user_id):
        return (wallet_id, user_id) in store.favorites

    async def set_favorite(wallet_id, user_id, value):
        if value:
            store.favorites.add((wallet_id, user_id))
        else:
            store.favorites.discard((wallet_id, user_id))

    monkeypatch.setattr(WalletMemberTable, "find_favorite", find_favorite)
    monkeypatch.setattr(WalletMemberTable, "set_favorite", set_favorite)


def _install_groups(monkeypatch: pytest.MonkeyPatch, store: FakeStore) -> None:
    async def ensure_defaults(user_id):
        store.ensure_defaults(user_id)

    async def list_for_user(user_id, lock=False):
        return [
            dict(g)
            for kind in WalletKind
            for g in store.groups_of(user_id, kind)
        ]

    async def find_default_id(user_id, kind):
        found = [
            g["id"]
            for g in store.groups_of(user_id, kind)
            if g["is_default"]
        ]
        return found[0] if found else None

    async def name_taken(user_id, kind, name, exclude_id=None):
        return name in [g["name"] for g in store.groups_of(user_id, kind) if g["id"] != exclude_id]

    async def set_positions(positions):
        moved = {id: {**store.groups[id], "position": p} for id, p in positions.items()}
        store.groups.update(moved)

    async def create(data, session=None):
        id = str(uuid.uuid4())
        store.groups[id] = {"id": id, "is_default": False, **data}
        return {"id": id}

    async def update_by_id(id, data=None, session=None, *, also_changed=False):
        store.groups[id].update(data or {})
        return {"id": id}

    async def remove(id):
        del store.groups[id]

    for name, fake in {
        "ensure_defaults": ensure_defaults,
        "list_for_user": list_for_user,
        "find_default_id": find_default_id,
        "name_taken": name_taken,
        "set_positions": set_positions,
        "create": create,
        "update_by_id": update_by_id,
        "remove": remove,
    }.items():
        monkeypatch.setattr(WalletGroupTable, name, fake)


def _install_placements(monkeypatch: pytest.MonkeyPatch, store: FakeStore) -> None:
    """成員紀錄上的群組與顯示。"""

    async def find_placement(wallet_id, user_id):
        found = store.placements.get((wallet_id, user_id))
        return None if found is None else dict(found)

    async def set_group(wallet_id, user_id, group_id):
        store.placements[(wallet_id, user_id)]["group_id"] = group_id

    async def set_hidden(wallet_id, user_id, value):
        store.placements[(wallet_id, user_id)]["is_hidden"] = value

    async def move_group(from_group_id, to_group_id):
        for placement in store.placements.values():
            if placement["group_id"] == from_group_id:
                placement["group_id"] = to_group_id

    for name, fake in {
        "find_placement": find_placement,
        "set_group": set_group,
        "set_hidden": set_hidden,
        "move_group": move_group,
    }.items():
        monkeypatch.setattr(WalletMemberTable, name, fake)


def _install_members(monkeypatch: pytest.MonkeyPatch, store: FakeStore) -> None:
    async def create(data, session=None):
        store.join(data["wallet_id"], data["user_id"], MemberRole(data["role"]), data["group_id"])
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
        store.leave(wallet_id, user_id)

    async def add_if_absent(wallet_id, user_id, role, group_id):
        store.join(wallet_id, user_id, role, group_id)

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
    for service in (
        member_service,
        entry_service,
        entry_log_service,
        expense_service,
        settlement_service,
    ):
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


def _install_advances(monkeypatch: pytest.MonkeyPatch, store: FakeStore) -> None:
    """代墊才用到的查詢: 對象的取得或建立、未還金額、某筆代墊的還款。"""

    async def find_or_create(wallet_id, name):
        return dict(store.target(wallet_id, name))

    async def add_outstanding(id, delta):
        store.targets[id]["outstanding"] += delta
        return store.targets[id]["outstanding"]

    async def list_in_wallet(wallet_id):
        found = [dict(t) for t in store.targets.values() if t["wallet_id"] == wallet_id]
        return sorted(found, key=lambda t: t["name"])

    async def list_repayments(wallet_id, advance_id):
        rows = [
            store.entry_detail(id)
            for id, e in store.entries.items()
            if e["wallet_id"] == wallet_id and e["advance_id"] == advance_id
        ]
        rows.sort(key=lambda e: (e["entry_date"], e["created_at"]), reverse=True)
        return rows

    monkeypatch.setattr(WalletAdvanceTargetTable, "find_or_create", find_or_create)
    monkeypatch.setattr(WalletAdvanceTargetTable, "add_outstanding", add_outstanding)
    monkeypatch.setattr(WalletAdvanceTargetTable, "list_in_wallet", list_in_wallet)
    monkeypatch.setattr(WalletEntryTable, "list_repayments", list_repayments)


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


def _install_expenses(monkeypatch: pytest.MonkeyPatch, store: FakeStore) -> None:
    """旅遊錢包的帳: 連同分攤一起存取。"""

    def _copy(id: str) -> dict:
        expense = store.expenses[id]
        return {**expense, "shares": [dict(share) for share in expense["shares"]]}

    async def create_with_shares(data, shares):
        id = str(uuid.uuid4())
        store.expenses[id] = {
            "id": id,
            "created_at": datetime(2026, 11, 2) + timedelta(seconds=len(store.expenses)),
            **data,
            "shares": [dict(share) for share in shares],
        }
        return id

    async def find_detail_in_wallet(wallet_id, id):
        found = store.expenses.get(id)
        return None if found is None or found["wallet_id"] != wallet_id else _copy(id)

    async def replace_in_wallet(wallet_id, id, data, shares):
        store.expenses[id].update(data)
        store.expenses[id]["shares"] = [dict(share) for share in shares]

    async def delete_in_wallet(wallet_id, id):
        if store.expenses.get(id, {}).get("wallet_id") == wallet_id:
            del store.expenses[id]

    def _in_wallet(wallet_id):
        return [_copy(id) for id, e in store.expenses.items() if e["wallet_id"] == wallet_id]

    async def find_page(wallet_id, limit, cursor=None):
        # 排序與游標的 SQL 在 test_model.py 驗, 這裡只照日期新到舊回傳全部。
        rows = _in_wallet(wallet_id)
        rows.sort(key=lambda e: (e["entry_date"], e["created_at"]), reverse=True)
        return {"list_data": rows, "next_cursor": None}

    for name, fake in {
        "create_with_shares": create_with_shares,
        "find_detail_in_wallet": find_detail_in_wallet,
        "replace_in_wallet": replace_in_wallet,
        "delete_in_wallet": delete_in_wallet,
        "find_page": find_page,
    }.items():
        monkeypatch.setattr(TravelExpenseTable, name, fake)


def _install_expense_totals(monkeypatch: pytest.MonkeyPatch, store: FakeStore) -> None:
    """每人的付款與分攤總額、成員有沒有紀錄。"""

    def _in_wallet(wallet_id):
        return [e for e in store.expenses.values() if e["wallet_id"] == wallet_id]

    async def totals(wallet_id):
        result: dict[str, dict] = {}
        for expense in _in_wallet(wallet_id):
            payer = result.setdefault(expense["payer_id"], {"paid": 0, "owed": 0})
            payer["paid"] += expense["amount"]
            for share in expense["shares"]:
                result.setdefault(share["user_id"], {"paid": 0, "owed": 0})
                result[share["user_id"]]["owed"] += share["amount"]
        return result

    async def has_records(wallet_id, user_id):
        return any(
            e["payer_id"] == user_id or any(s["user_id"] == user_id for s in e["shares"])
            for e in _in_wallet(wallet_id)
        )

    for name, fake in {"totals": totals, "has_records": has_records}.items():
        monkeypatch.setattr(TravelExpenseTable, name, fake)


def _install_settlements(monkeypatch: pytest.MonkeyPatch, store: FakeStore) -> None:
    """清償方案: 整份寫入、整份作廢, 逐筆標記付款與確認。"""

    async def create_plan(wallet_id, transfers):
        for transfer in transfers:
            store.add_settlement(
                wallet_id, transfer["from_user_id"], transfer["to_user_id"], transfer["amount"]
            )

    async def delete_in_wallet(wallet_id):
        store.settlements = {
            id: t for id, t in store.settlements.items() if t["wallet_id"] != wallet_id
        }

    async def list_in_wallet(wallet_id):
        return [dict(t) for t in store.transfers_of(wallet_id)]

    async def find_detail_in_wallet(wallet_id, id):
        found = store.settlements.get(id)
        return None if found is None or found["wallet_id"] != wallet_id else dict(found)

    async def set_paid(id, paid_at):
        store.settlements[id]["paid_at"] = paid_at

    async def set_confirmed(id, confirmed_by, confirmed_at):
        store.settlements[id].update(confirmed_by=confirmed_by, confirmed_at=confirmed_at)

    async def count_unconfirmed(wallet_id):
        return sum(t["confirmed_at"] is None for t in store.transfers_of(wallet_id))

    for name, fake in {
        "create_plan": create_plan,
        "delete_in_wallet": delete_in_wallet,
        "list_in_wallet": list_in_wallet,
        "find_detail_in_wallet": find_detail_in_wallet,
        "set_paid": set_paid,
        "set_confirmed": set_confirmed,
        "count_unconfirmed": count_unconfirmed,
    }.items():
        monkeypatch.setattr(TravelSettlementTransferTable, name, fake)
    monkeypatch.setattr(settlement_service, "utc_now", lambda: store.now)


@pytest.fixture
def store(monkeypatch: pytest.MonkeyPatch) -> FakeStore:
    fake = FakeStore()
    _install_wallets(monkeypatch, fake)
    _install_wallet_status(monkeypatch, fake)
    _install_members(monkeypatch, fake)
    _install_favorites(monkeypatch, fake)
    _install_groups(monkeypatch, fake)
    _install_placements(monkeypatch, fake)
    _install_admin(monkeypatch, fake)
    _install_categories(monkeypatch, fake)
    _install_invites(monkeypatch, fake)
    _install_ledger_lookups(monkeypatch, fake)
    _install_entries(monkeypatch, fake)
    _install_transfers(monkeypatch, fake)
    _install_advances(monkeypatch, fake)
    _install_entry_logs(monkeypatch, fake)
    _install_expenses(monkeypatch, fake)
    _install_expense_totals(monkeypatch, fake)
    _install_settlements(monkeypatch, fake)
    return fake


@pytest.fixture(autouse=True)
def _current_users(set_current_users):
    set_current_users(USERS)
