"""一般錢包的帳目 (`modules/wallets/entries.py`、`entry_logs.py`): 收支、調整餘額、權限與異動紀錄。

查詢本身 (排序、游標、cascade、併發時的鎖) 在 `test_model.py` 對真的 PostgreSQL 驗。
"""

import pytest
from httpx import AsyncClient

from modules.wallets.model import CategoryType, EntryKind, MemberRole, WalletKind
from modules.wallets.schema import MAX_SAFE_AMOUNT

from ..helpers import authenticate
from .conftest import ALICE, BOB, SUPER, FakeStore

DAY = "2026-10-18"


@pytest.fixture
def wallet(store: FakeStore) -> str:
    """Alice 是管理者、Bob 是成員, 餘額 1000。"""
    return store.add_wallet(balance=1000, members={ALICE: MemberRole.ADMIN, BOB: MemberRole.MEMBER})


@pytest.fixture
def food(store: FakeStore, wallet: str) -> str:
    return store.add_category(wallet, "餐飲", CategoryType.EXPENSE)


@pytest.fixture
def salary(store: FakeStore, wallet: str) -> str:
    return store.add_category(wallet, "薪資", CategoryType.INCOME)


def _expense(category_id: str, amount: int = 300, **extra) -> dict:
    return {
        "kind": "expense",
        "amount": amount,
        "category_id": category_id,
        "entry_date": DAY,
        **extra,
    }


def _income(category_id: str, amount: int = 500) -> dict:
    return {"kind": "income", "amount": amount, "category_id": category_id, "entry_date": DAY}


async def _create(client: AsyncClient, wallet: str, body: dict) -> str:
    response = await client.post(f"/api/wallets/{wallet}/entries", json=body)
    assert response.status_code == 200, response.json()
    return response.json()["id"]


# ── 新增 ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_income_as_member_adds_to_balance(client, store, wallet, salary):
    authenticate(client, "bob")

    await _create(client, wallet, _income(salary, 500))

    assert store.balance(wallet) == 1500


@pytest.mark.asyncio
async def test_create_expense_subtracts_from_balance_allowing_negative(client, store, wallet, food):
    authenticate(client, "bob")

    await _create(client, wallet, _expense(food, 1200))

    assert store.balance(wallet) == -200


@pytest.mark.asyncio
async def test_create_entry_records_creator_and_log(client, store, wallet, food):
    authenticate(client, "bob")

    entry_id = await _create(client, wallet, _expense(food, 300, note=" 午餐 "))

    assert store.entries[entry_id]["created_by"] == BOB
    assert store.entries[entry_id]["note"] == "午餐"
    [log] = store.logs
    assert log["action"] == "create"
    assert log["actor_id"] == BOB
    assert log["before"] is None
    assert log["after"] == {
        "kind": "expense",
        "amount": 300,
        "category_name": "餐飲",
        "counterpart_wallet_name": None,
        "advance_target_name": None,
        "entry_date": DAY,
        "note": "午餐",
    }
    assert log["as_super_admin"] is False


@pytest.mark.asyncio
async def test_create_entry_locks_wallet(client, store, wallet, food):
    authenticate(client, "bob")

    await _create(client, wallet, _expense(food))

    assert store.locked == [wallet]


@pytest.mark.asyncio
async def test_create_entry_with_category_of_other_type_returns_400(client, store, wallet, salary):
    authenticate(client, "bob")

    response = await client.post(f"/api/wallets/{wallet}/entries", json=_expense(salary))

    assert response.status_code == 400
    assert response.json()["detail"] == "分類的類型與收支不符"
    assert store.balance(wallet) == 1000


@pytest.mark.asyncio
async def test_create_entry_with_archived_category_returns_404(client, store, wallet):
    archived = store.add_category(wallet, "舊分類", archived=True)
    authenticate(client, "bob")

    response = await client.post(f"/api/wallets/{wallet}/entries", json=_expense(archived))

    assert response.status_code == 404
    assert response.json()["detail"] == "分類不存在"


@pytest.mark.asyncio
async def test_create_entry_with_category_of_other_wallet_returns_404(client, store, wallet):
    other = store.add_wallet(members={BOB: MemberRole.ADMIN})
    foreign = store.add_category(other, "餐飲")
    authenticate(client, "bob")

    response = await client.post(f"/api/wallets/{wallet}/entries", json=_expense(foreign))

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_create_entry_with_non_positive_amount_returns_422(client, store, wallet, food):
    authenticate(client, "bob")

    for amount in (0, -100):
        response = await client.post(f"/api/wallets/{wallet}/entries", json=_expense(food, amount))

        assert response.status_code == 422, amount
    assert store.entries == {}


@pytest.mark.asyncio
async def test_create_entry_with_long_note_returns_422(client, store, wallet, food):
    authenticate(client, "bob")

    response = await client.post(
        f"/api/wallets/{wallet}/entries", json=_expense(food, note="字" * 201)
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_entry_overflowing_balance_returns_400(client, store, salary, wallet):
    store.wallets[wallet]["balance"] = MAX_SAFE_AMOUNT
    authenticate(client, "bob")

    response = await client.post(f"/api/wallets/{wallet}/entries", json=_income(salary, 1))

    assert response.status_code == 400
    assert response.json()["detail"] == "餘額超出可記錄的範圍"
    assert store.balance(wallet) == MAX_SAFE_AMOUNT


@pytest.mark.asyncio
async def test_create_entry_in_travel_wallet_returns_400(client, store):
    travel = store.add_wallet(kind=WalletKind.TRAVEL)
    authenticate(client, "alice")

    response = await client.get(f"/api/wallets/{travel}/entries")

    assert response.status_code == 400
    assert response.json()["detail"] == "只有一般錢包可以記收支"


@pytest.mark.asyncio
async def test_entry_routes_as_non_member_return_404(client, store, wallet, food):
    entry_id = store.add_entry(wallet, BOB, category_id=food)
    base = f"/api/wallets/{wallet}"
    routes: list[tuple[str, str, dict | None]] = [
        ("GET", f"{base}/entries", None),
        ("POST", f"{base}/entries", _expense(food)),
        ("POST", f"{base}/adjustments", {"balance": 0, "entry_date": DAY}),
        ("PATCH", f"{base}/entries/{entry_id}", _expense(food, 1)),
        ("DELETE", f"{base}/entries/{entry_id}", None),
        ("GET", f"{base}/entries/{entry_id}/logs", None),
        ("GET", f"{base}/entry-logs", None),
    ]
    authenticate(client, "carol")

    for method, url, body in routes:
        response = await client.request(method, url, json=body)

        assert response.status_code == 404, (method, url)
        assert response.json()["detail"] == "錢包不存在"


# ── 調整餘額 ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_adjust_balance_records_difference(client, store, wallet):
    authenticate(client, "bob")

    response = await client.post(
        f"/api/wallets/{wallet}/adjustments", json={"balance": 750, "entry_date": DAY}
    )

    assert response.status_code == 200
    entry = store.entries[response.json()["id"]]
    assert (entry["kind"], entry["amount"], entry["category_id"]) == (
        EntryKind.ADJUSTMENT,
        -250,
        None,
    )
    assert store.balance(wallet) == 750


@pytest.mark.asyncio
async def test_adjust_balance_without_change_returns_400(client, store, wallet):
    authenticate(client, "bob")

    response = await client.post(
        f"/api/wallets/{wallet}/adjustments", json={"balance": 1000, "entry_date": DAY}
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "餘額沒有變化"
    assert store.entries == {}


@pytest.mark.asyncio
async def test_update_adjustment_returns_400(client, store, wallet, food):
    entry_id = store.add_entry(wallet, BOB, kind=EntryKind.ADJUSTMENT, amount=-250)
    authenticate(client, "bob")

    response = await client.patch(
        f"/api/wallets/{wallet}/entries/{entry_id}", json=_expense(food, 100)
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "調整不能修改，請刪除後重新調整"


@pytest.mark.asyncio
async def test_delete_adjustment_reverts_difference(client, store, wallet):
    entry_id = store.add_entry(wallet, BOB, kind=EntryKind.ADJUSTMENT, amount=-250)
    authenticate(client, "bob")

    response = await client.delete(f"/api/wallets/{wallet}/entries/{entry_id}")

    assert response.status_code == 200
    assert store.balance(wallet) == 1250


# ── 修改 ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_entry_applies_difference_to_balance(client, store, wallet, food):
    entry_id = store.add_entry(wallet, BOB, amount=300, category_id=food)
    authenticate(client, "bob")

    response = await client.patch(
        f"/api/wallets/{wallet}/entries/{entry_id}", json=_expense(food, 500)
    )

    assert response.status_code == 200
    assert store.entries[entry_id]["amount"] == 500
    assert store.balance(wallet) == 800


@pytest.mark.asyncio
async def test_update_income_to_expense_applies_both_sides(client, store, wallet, food, salary):
    entry_id = store.add_entry(wallet, BOB, kind=EntryKind.INCOME, amount=200, category_id=salary)
    authenticate(client, "bob")

    response = await client.patch(
        f"/api/wallets/{wallet}/entries/{entry_id}", json=_expense(food, 200)
    )

    assert response.status_code == 200
    assert store.balance(wallet) == 600


@pytest.mark.asyncio
async def test_update_entry_keeping_archived_category_succeeds(client, store, wallet):
    archived = store.add_category(wallet, "舊分類", archived=True)
    entry_id = store.add_entry(wallet, BOB, amount=300, category_id=archived)
    authenticate(client, "bob")

    response = await client.patch(
        f"/api/wallets/{wallet}/entries/{entry_id}", json=_expense(archived, 300, note="補備註")
    )

    assert response.status_code == 200
    assert store.logs[-1]["after"]["category_name"] == "舊分類"


@pytest.mark.asyncio
async def test_update_entry_to_other_archived_category_returns_404(client, store, wallet, food):
    archived = store.add_category(wallet, "舊分類", archived=True)
    entry_id = store.add_entry(wallet, BOB, category_id=food)
    authenticate(client, "bob")

    response = await client.patch(
        f"/api/wallets/{wallet}/entries/{entry_id}", json=_expense(archived)
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_entry_of_others_as_member_returns_403(client, store, wallet, food):
    entry_id = store.add_entry(wallet, ALICE, category_id=food)
    authenticate(client, "bob")

    response = await client.patch(
        f"/api/wallets/{wallet}/entries/{entry_id}", json=_expense(food, 1)
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "只能修改、刪除自己記的帳"


@pytest.mark.asyncio
async def test_update_entry_of_others_as_admin_succeeds(client, store, wallet, food):
    entry_id = store.add_entry(wallet, BOB, amount=300, category_id=food)
    authenticate(client, "alice")

    response = await client.patch(
        f"/api/wallets/{wallet}/entries/{entry_id}", json=_expense(food, 100)
    )

    assert response.status_code == 200
    assert store.logs[-1]["actor_id"] == ALICE
    assert store.logs[-1]["as_super_admin"] is False


@pytest.mark.asyncio
async def test_update_own_entry_after_rejoining_succeeds(client, store, wallet, food):
    """「自己的帳」看的是記帳人的帳號, 不是成員紀錄 (離開時成員紀錄被刪掉, 回來是新的一筆)。"""
    entry_id = store.add_entry(wallet, BOB, category_id=food)
    store.members.pop((wallet, BOB))
    store.members[(wallet, BOB)] = MemberRole.MEMBER
    authenticate(client, "bob")

    response = await client.patch(
        f"/api/wallets/{wallet}/entries/{entry_id}", json=_expense(food, 1)
    )

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_update_entry_logs_before_and_after(client, store, wallet, food, salary):
    entry_id = store.add_entry(wallet, BOB, amount=300, category_id=food, note="午餐")
    authenticate(client, "bob")

    await client.patch(f"/api/wallets/{wallet}/entries/{entry_id}", json=_income(salary, 500))

    [log] = store.logs
    assert log["action"] == "update"
    assert log["before"] == {
        "kind": "expense",
        "amount": 300,
        "category_name": "餐飲",
        "counterpart_wallet_name": None,
        "advance_target_name": None,
        "entry_date": DAY,
        "note": "午餐",
    }
    assert log["after"] == {
        "kind": "income",
        "amount": 500,
        "category_name": "薪資",
        "counterpart_wallet_name": None,
        "advance_target_name": None,
        "entry_date": DAY,
        "note": "",
    }


@pytest.mark.asyncio
async def test_update_entry_without_change_returns_204(client, store, wallet, food):
    entry_id = store.add_entry(wallet, BOB, amount=300, category_id=food)
    authenticate(client, "bob")

    response = await client.patch(
        f"/api/wallets/{wallet}/entries/{entry_id}", json=_expense(food, 300)
    )

    assert response.status_code == 204
    assert store.logs == []
    assert store.balance(wallet) == 1000


# ── 刪除 ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_entry_reverts_balance(client, store, wallet, food):
    entry_id = store.add_entry(wallet, BOB, amount=300, category_id=food)
    authenticate(client, "bob")

    response = await client.delete(f"/api/wallets/{wallet}/entries/{entry_id}")

    assert response.status_code == 200
    assert entry_id not in store.entries
    assert store.balance(wallet) == 1300


@pytest.mark.asyncio
async def test_delete_entry_of_others_as_member_returns_403(client, store, wallet, food):
    entry_id = store.add_entry(wallet, ALICE, category_id=food)
    authenticate(client, "bob")

    response = await client.delete(f"/api/wallets/{wallet}/entries/{entry_id}")

    assert response.status_code == 403
    assert entry_id in store.entries


@pytest.mark.asyncio
async def test_delete_entry_logs_before_snapshot(client, store, wallet, food):
    entry_id = store.add_entry(wallet, BOB, amount=300, category_id=food)
    authenticate(client, "alice")

    await client.delete(f"/api/wallets/{wallet}/entries/{entry_id}")

    [log] = store.logs
    assert (log["action"], log["entry_id"], log["actor_id"]) == ("delete", entry_id, ALICE)
    assert log["before"]["amount"] == 300
    assert log["after"] is None


@pytest.mark.asyncio
async def test_delete_unknown_entry_returns_404(client, store, wallet, food):
    other = store.add_wallet(members={BOB: MemberRole.ADMIN})
    foreign = store.add_entry(other, BOB, category_id=food)
    authenticate(client, "bob")

    for entry_id in (foreign, "0123abcd-4567-89ab-cdef-0123456789ab"):
        response = await client.delete(f"/api/wallets/{wallet}/entries/{entry_id}")

        assert response.status_code == 404
        assert response.json()["detail"] == "帳目不存在"
    assert foreign in store.entries


# ── 超級管理者 ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_entry_as_super_admin_non_member_is_marked(client, store, wallet, food):
    authenticate(client, "super")

    await _create(client, wallet, _expense(food))

    assert store.logs[-1]["as_super_admin"] is True


@pytest.mark.asyncio
async def test_create_entry_as_super_admin_member_is_not_marked(client, store, wallet, food):
    store.members[(wallet, SUPER)] = MemberRole.MEMBER
    authenticate(client, "super")

    await _create(client, wallet, _expense(food))

    assert store.logs[-1]["as_super_admin"] is False


@pytest.mark.asyncio
async def test_update_others_entry_as_super_admin_member_is_marked(client, store, wallet, food):
    store.members[(wallet, SUPER)] = MemberRole.MEMBER
    entry_id = store.add_entry(wallet, BOB, category_id=food)
    authenticate(client, "super")

    response = await client.patch(
        f"/api/wallets/{wallet}/entries/{entry_id}", json=_expense(food, 1)
    )

    assert response.status_code == 200
    assert store.logs[-1]["as_super_admin"] is True


# ── 列表與異動紀錄 ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_entries_returns_creator_nickname_and_category(client, store, wallet, food):
    entry_id = store.add_entry(wallet, BOB, amount=300, category_id=food, note="午餐")
    store.add_entry(wallet, ALICE, kind=EntryKind.ADJUSTMENT, amount=-50)
    authenticate(client, "bob")

    response = await client.get(f"/api/wallets/{wallet}/entries")

    assert response.status_code == 200
    body = response.json()
    assert body["next_cursor"] is None
    adjustment, expense = body["list_data"]
    assert expense["id"] == entry_id
    assert expense["category"] == {"id": food, "name": "餐飲"}
    assert expense["created_by"] == {"user_id": BOB, "nickname": "Bob"}
    assert adjustment["category"] is None
    assert adjustment["amount"] == -50


@pytest.mark.asyncio
async def test_list_entry_logs_as_member_returns_history(client, store, wallet, food):
    authenticate(client, "alice")
    entry_id = await _create(client, wallet, _expense(food, 300))
    await client.patch(f"/api/wallets/{wallet}/entries/{entry_id}", json=_expense(food, 400))
    authenticate(client, "bob")

    response = await client.get(f"/api/wallets/{wallet}/entries/{entry_id}/logs")

    assert response.status_code == 200
    logs = response.json()["list_data"]
    assert [log["action"] for log in logs] == ["update", "create"]
    assert logs[0]["actor"] == {"user_id": ALICE, "nickname": "Alice"}
    assert (logs[0]["before"]["amount"], logs[0]["after"]["amount"]) == (300, 400)


@pytest.mark.asyncio
async def test_list_wallet_logs_includes_deleted_entries(client, store, wallet, food):
    authenticate(client, "bob")
    entry_id = await _create(client, wallet, _expense(food))
    await client.delete(f"/api/wallets/{wallet}/entries/{entry_id}")

    wallet_logs = await client.get(f"/api/wallets/{wallet}/entry-logs")
    entry_logs = await client.get(f"/api/wallets/{wallet}/entries/{entry_id}/logs")

    assert [log["action"] for log in wallet_logs.json()["list_data"]] == ["delete", "create"]
    assert entry_logs.status_code == 200
