"""一般錢包之間的轉帳 (`modules/wallets/transfers.py`): 兩邊一起建立、修改、刪除, 以及兩邊的權限。

對方錢包刪除時設成 NULL 的外鍵在 `test_model.py` 對真的 PostgreSQL 驗。
"""

import uuid

import pytest
from httpx import AsyncClient

from modules.wallets.model import CategoryType, EntryKind, MemberRole, WalletKind
from modules.wallets.schema import MAX_SAFE_AMOUNT

from ..helpers import authenticate
from .conftest import ALICE, BOB, SUPER, FakeStore

DAY = "2026-10-18"


@pytest.fixture
def home(store: FakeStore) -> str:
    """Alice 是管理者、Bob 是成員, 餘額 1000。"""
    return store.add_wallet(
        name="家用", balance=1000, members={ALICE: MemberRole.ADMIN, BOB: MemberRole.MEMBER}
    )


@pytest.fixture
def savings(store: FakeStore) -> str:
    """Alice 是管理者、Bob 是成員, 餘額 500。"""
    return store.add_wallet(
        name="存款", balance=500, members={ALICE: MemberRole.ADMIN, BOB: MemberRole.MEMBER}
    )


def _transfer(counterpart: str, amount: int = 300, kind: str = "transfer_out", **extra) -> dict:
    return {
        "kind": kind,
        "counterpart_wallet_id": counterpart,
        "amount": amount,
        "entry_date": DAY,
        **extra,
    }


async def _create(client: AsyncClient, wallet: str, body: dict) -> str:
    response = await client.post(f"/api/wallets/{wallet}/transfers", json=body)
    assert response.status_code == 200, response.json()
    return response.json()["id"]


def _pair(store: FakeStore, entry_id: str) -> tuple[dict, dict]:
    entry = store.entries[entry_id]
    [other] = [
        e
        for e in store.entries.values()
        if e["transfer_id"] == entry["transfer_id"] and e["id"] != entry_id
    ]
    return entry, other


def _add_pair(
    store: FakeStore, wallet: str, counterpart: str, created_by: str, amount: int = 300
) -> str:
    """直接放一組轉出 / 轉入 (不動餘額、不留紀錄), 回傳 `wallet` 這一邊的 id。"""
    transfer_id = str(uuid.uuid4())
    here = store.add_entry(
        wallet,
        created_by,
        kind=EntryKind.TRANSFER_OUT,
        amount=amount,
        transfer_id=transfer_id,
        counterpart_wallet_id=counterpart,
    )
    store.add_entry(
        counterpart,
        created_by,
        kind=EntryKind.TRANSFER_IN,
        amount=amount,
        transfer_id=transfer_id,
        counterpart_wallet_id=wallet,
    )
    return here


# ── 新增 ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_transfer_out_moves_amount_to_counterpart(client, store, home, savings):
    authenticate(client, "bob")

    await _create(client, home, _transfer(savings, 300))

    assert store.balance(home) == 700
    assert store.balance(savings) == 800


@pytest.mark.asyncio
async def test_create_transfer_in_moves_amount_from_counterpart(client, store, home, savings):
    authenticate(client, "bob")

    await _create(client, home, _transfer(savings, 200, kind="transfer_in"))

    assert store.balance(home) == 1200
    assert store.balance(savings) == 300


@pytest.mark.asyncio
async def test_create_transfer_links_both_entries_and_logs_each_wallet(
    client, store, home, savings
):
    authenticate(client, "bob")

    entry_id = await _create(client, home, _transfer(savings, 300, note=" 存錢 "))

    here, there = _pair(store, entry_id)
    assert (here["wallet_id"], here["kind"], here["counterpart_wallet_id"]) == (
        home,
        EntryKind.TRANSFER_OUT,
        savings,
    )
    assert (there["wallet_id"], there["kind"], there["counterpart_wallet_id"]) == (
        savings,
        EntryKind.TRANSFER_IN,
        home,
    )
    assert here["category_id"] is None and here["note"] == "存錢" and there["created_by"] == BOB
    by_wallet = {log["wallet_id"]: log for log in store.logs}
    assert by_wallet[home]["entry_id"] == here["id"]
    assert by_wallet[home]["after"]["counterpart_wallet_name"] == "存款"
    assert by_wallet[savings]["entry_id"] == there["id"]
    assert by_wallet[savings]["after"] == {
        "kind": "transfer_in",
        "amount": 300,
        "category_name": None,
        "counterpart_wallet_name": "家用",
        "entry_date": DAY,
        "note": "存錢",
    }


@pytest.mark.asyncio
async def test_create_transfer_locks_both_wallets_in_id_order(client, store, home, savings):
    authenticate(client, "bob")

    await _create(client, savings, _transfer(home))

    assert store.locked == sorted([home, savings])


@pytest.mark.asyncio
async def test_create_transfer_to_same_wallet_returns_400(client, store, home):
    authenticate(client, "bob")

    response = await client.post(f"/api/wallets/{home}/transfers", json=_transfer(home.upper()))

    assert response.status_code == 400
    assert response.json()["detail"] == "不能轉給同一個錢包"
    assert store.entries == {}


@pytest.mark.asyncio
async def test_create_transfer_to_wallet_not_joined_returns_404(client, store, home):
    others = store.add_wallet(name="別人的", members={SUPER: MemberRole.ADMIN})
    authenticate(client, "bob")

    for target in (others, str(uuid.uuid4())):
        response = await client.post(f"/api/wallets/{home}/transfers", json=_transfer(target))

        assert response.status_code == 404
        assert response.json()["detail"] == "對方錢包不存在"
    assert store.balance(home) == 1000


@pytest.mark.asyncio
async def test_create_transfer_to_travel_wallet_returns_400(client, store, home):
    trip = store.add_wallet(WalletKind.TRAVEL, members={BOB: MemberRole.MEMBER})
    authenticate(client, "bob")

    response = await client.post(f"/api/wallets/{home}/transfers", json=_transfer(trip))

    assert response.status_code == 400
    assert response.json()["detail"] == "只能轉到一般錢包"


@pytest.mark.asyncio
async def test_create_transfer_as_super_admin_non_member_returns_403(client, store, home):
    mine = store.add_wallet(name="超管的", members={SUPER: MemberRole.ADMIN})
    authenticate(client, "super")

    from_unjoined = await client.post(f"/api/wallets/{home}/transfers", json=_transfer(mine))
    to_unjoined = await client.post(f"/api/wallets/{mine}/transfers", json=_transfer(home))

    assert from_unjoined.status_code == 403
    assert from_unjoined.json()["detail"] == "要同時是兩個錢包的成員才能轉帳"
    assert to_unjoined.status_code == 404
    assert store.entries == {}


@pytest.mark.asyncio
async def test_create_transfer_overflowing_counterpart_balance_returns_400(
    client, store, home, savings
):
    store.wallets[savings]["balance"] = MAX_SAFE_AMOUNT - 100
    authenticate(client, "bob")

    response = await client.post(f"/api/wallets/{home}/transfers", json=_transfer(savings, 101))

    assert response.status_code == 400
    assert response.json()["detail"] == "餘額超出可記錄的範圍"
    assert store.balance(home) == 1000


# ── 修改 ────────────────────────────────────────────────────────────────────


def _update(amount: int = 500, **extra) -> dict:
    return {"amount": amount, "entry_date": DAY, **extra}


@pytest.mark.asyncio
async def test_update_transfer_applies_difference_to_both_wallets(client, store, home, savings):
    authenticate(client, "bob")
    entry_id = await _create(client, home, _transfer(savings, 300))

    response = await client.patch(
        f"/api/wallets/{savings}/transfers/{_pair(store, entry_id)[1]['id']}",
        json=_update(500, note="改了"),
    )

    assert response.status_code == 200, response.json()
    assert store.balance(home) == 500
    assert store.balance(savings) == 1000
    here, there = _pair(store, entry_id)
    assert (here["amount"], here["note"]) == (500, "改了")
    assert (there["amount"], there["note"]) == (500, "改了")
    updates = [log for log in store.logs if log["action"] == "update"]
    assert {log["wallet_id"] for log in updates} == {home, savings}
    assert all(log["before"]["amount"] == 300 and log["after"]["amount"] == 500 for log in updates)


@pytest.mark.asyncio
async def test_update_transfer_after_leaving_counterpart_returns_403(client, store, home, savings):
    entry_id = _add_pair(store, home, savings, BOB)
    del store.members[(savings, BOB)]
    authenticate(client, "bob")

    response = await client.patch(f"/api/wallets/{home}/transfers/{entry_id}", json=_update())

    assert response.status_code == 403
    assert response.json()["detail"] == "要在兩個錢包都有權限才能修改、刪除這筆轉帳"
    assert store.entries[entry_id]["amount"] == 300


@pytest.mark.asyncio
async def test_update_transfer_after_rejoining_succeeds(client, store, home, savings):
    entry_id = _add_pair(store, home, savings, BOB)
    del store.members[(savings, BOB)]
    store.members[(savings, BOB)] = MemberRole.MEMBER
    authenticate(client, "bob")

    response = await client.patch(f"/api/wallets/{home}/transfers/{entry_id}", json=_update())

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_update_others_transfer_as_admin_of_one_side_returns_403(
    client, store, home, savings
):
    entry_id = _add_pair(store, home, savings, ALICE)
    store.members[(home, BOB)] = MemberRole.ADMIN
    authenticate(client, "bob")

    response = await client.patch(f"/api/wallets/{home}/transfers/{entry_id}", json=_update())

    assert response.status_code == 403
    assert response.json()["detail"] == "要在兩個錢包都有權限才能修改、刪除這筆轉帳"


@pytest.mark.asyncio
async def test_update_others_transfer_as_admin_of_both_succeeds(client, store, home, savings):
    entry_id = _add_pair(store, home, savings, BOB)
    authenticate(client, "alice")

    response = await client.patch(f"/api/wallets/{home}/transfers/{entry_id}", json=_update())

    assert response.status_code == 200
    assert store.balance(home) == 800
    assert store.balance(savings) == 700


@pytest.mark.asyncio
async def test_update_transfer_as_super_admin_non_member_is_marked(client, store, home, savings):
    entry_id = _add_pair(store, home, savings, BOB)
    authenticate(client, "super")

    response = await client.patch(f"/api/wallets/{home}/transfers/{entry_id}", json=_update())

    assert response.status_code == 200
    assert len(store.logs) == 2
    assert all(log["as_super_admin"] for log in store.logs)


@pytest.mark.asyncio
async def test_update_transfer_via_entry_route_returns_400(client, store, home, savings):
    food = store.add_category(home, "餐飲", CategoryType.EXPENSE)
    entry_id = _add_pair(store, home, savings, BOB)
    authenticate(client, "bob")

    response = await client.patch(
        f"/api/wallets/{home}/entries/{entry_id}",
        json={"kind": "expense", "amount": 300, "category_id": food, "entry_date": DAY},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "轉帳與收支不能互相切換"


@pytest.mark.asyncio
async def test_update_income_via_transfer_route_returns_400(client, store, home):
    entry_id = store.add_entry(home, BOB, kind=EntryKind.INCOME)
    authenticate(client, "bob")

    response = await client.patch(f"/api/wallets/{home}/transfers/{entry_id}", json=_update())

    assert response.status_code == 400
    assert response.json()["detail"] == "轉帳與收支不能互相切換"


@pytest.mark.asyncio
async def test_update_transfer_without_change_returns_204(client, store, home, savings):
    entry_id = _add_pair(store, home, savings, BOB)
    authenticate(client, "bob")

    response = await client.patch(
        f"/api/wallets/{home}/transfers/{entry_id}", json=_update(300, note="")
    )

    assert response.status_code == 204
    assert store.logs == []


# ── 刪除 ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_transfer_reverts_both_wallets_and_logs_each(client, store, home, savings):
    authenticate(client, "bob")
    entry_id = await _create(client, home, _transfer(savings, 300))

    response = await client.delete(f"/api/wallets/{home}/entries/{entry_id}")

    assert response.status_code == 200
    assert store.entries == {}
    assert store.balance(home) == 1000
    assert store.balance(savings) == 500
    deletes = [log for log in store.logs if log["action"] == "delete"]
    assert {log["wallet_id"] for log in deletes} == {home, savings}
    assert all(log["before"]["amount"] == 300 and log["after"] is None for log in deletes)


@pytest.mark.asyncio
async def test_delete_transfer_after_leaving_counterpart_returns_403(client, store, home, savings):
    entry_id = _add_pair(store, home, savings, BOB)
    del store.members[(savings, BOB)]
    authenticate(client, "bob")

    response = await client.delete(f"/api/wallets/{home}/entries/{entry_id}")

    assert response.status_code == 403
    assert len(store.entries) == 2


# ── 對方錢包已刪除 ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_orphan_transfer_returns_400(client, store, home, savings):
    entry_id = _add_pair(store, home, savings, BOB)
    store.delete_wallet(savings)
    authenticate(client, "bob")

    response = await client.patch(f"/api/wallets/{home}/transfers/{entry_id}", json=_update())

    assert response.status_code == 400
    assert response.json()["detail"] == "對方錢包已刪除，這筆轉帳只能刪除"


@pytest.mark.asyncio
async def test_delete_orphan_transfer_reverts_only_own_wallet(client, store, home, savings):
    entry_id = _add_pair(store, home, savings, BOB, amount=300)
    store.delete_wallet(savings)
    authenticate(client, "bob")

    response = await client.delete(f"/api/wallets/{home}/entries/{entry_id}")

    assert response.status_code == 200
    assert store.entries == {}
    assert store.balance(home) == 1300
    [log] = store.logs
    assert log["before"]["counterpart_wallet_name"] is None


@pytest.mark.asyncio
async def test_list_entries_returns_counterpart_wallet(client, store, home, savings):
    kept = _add_pair(store, home, savings, BOB)
    orphan = _add_pair(store, home, store.add_wallet(name="舊的"), BOB)
    store.delete_wallet(next(w for w in store.wallets if store.wallets[w]["name"] == "舊的"))
    authenticate(client, "bob")

    response = await client.get(f"/api/wallets/{home}/entries")

    by_id = {item["id"]: item for item in response.json()["list_data"]}
    assert by_id[kept]["counterpart_wallet"] == {"id": savings, "name": "存款"}
    assert by_id[kept]["category"] is None
    assert by_id[orphan]["kind"] == "transfer_out"
    assert by_id[orphan]["counterpart_wallet"] is None
