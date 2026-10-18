"""旅遊錢包的帳 (`modules/wallets/expenses.py`): 付款人、分攤、每人淨額與異動紀錄。

規則見 docs/features.md〈旅遊錢包〉。分攤存成每人的金額 (均分也是), 查詢、排序與 cascade
在 `test_model.py` 對真的 PostgreSQL 驗。
"""

import pytest
from httpx import AsyncClient

from modules.wallets.model import MemberRole, SplitMode, WalletKind

from ..helpers import authenticate
from .conftest import ALICE, BOB, CAROL, SUPER, FakeStore

DAY = "2026-11-02"


@pytest.fixture
def wallet(store: FakeStore) -> str:
    """依序加入: Alice (管理者)、Bob、Carol。"""
    return store.add_wallet(
        kind=WalletKind.TRAVEL,
        name="東京",
        members={ALICE: MemberRole.ADMIN, BOB: MemberRole.MEMBER, CAROL: MemberRole.MEMBER},
    )


def _equal(amount: int, payer: str, participants: list[str], **extra) -> dict:
    return {
        "split_mode": "equal",
        "amount": amount,
        "payer_id": payer,
        "participant_ids": participants,
        "entry_date": DAY,
        **extra,
    }


def _custom(amount: int, payer: str, shares: list[tuple[str, int]], **extra) -> dict:
    return {
        "split_mode": "custom",
        "amount": amount,
        "payer_id": payer,
        "shares": [{"user_id": user_id, "amount": value} for user_id, value in shares],
        "entry_date": DAY,
        **extra,
    }


async def _create(client: AsyncClient, wallet: str, body: dict) -> str:
    response = await client.post(f"/api/wallets/{wallet}/expenses", json=body)
    assert response.status_code == 200, response.json()
    return response.json()["id"]


# ── 均分 ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_expense_equal_split_gives_remainder_to_payer_first(client, store, wallet):
    authenticate(client, "alice")

    expense_id = await _create(client, wallet, _equal(101, BOB, [ALICE, BOB, CAROL], note="晚餐"))

    expense = store.expenses[expense_id]
    assert (expense["amount"], expense["payer_id"], expense["split_mode"]) == (101, BOB, "equal")
    assert (expense["note"], expense["created_by"]) == ("晚餐", ALICE)
    # 零頭 2: 付款人 Bob 先拿一份, 剩下的照加入順序給 Alice; 分攤依加入順序存。
    assert list(store.shares_of(expense_id).items()) == [(ALICE, 34), (BOB, 34), (CAROL, 33)]


@pytest.mark.asyncio
async def test_create_expense_equal_split_without_payer_follows_join_order(client, store, wallet):
    authenticate(client, "alice")

    expense_id = await _create(client, wallet, _equal(101, ALICE, [CAROL, BOB]))

    assert list(store.shares_of(expense_id).items()) == [(BOB, 51), (CAROL, 50)]


@pytest.mark.asyncio
async def test_create_expense_equal_split_below_head_count_gives_zero_to_the_rest(
    client, store, wallet
):
    authenticate(client, "alice")

    expense_id = await _create(client, wallet, _equal(1, CAROL, [ALICE, BOB, CAROL]))

    assert store.shares_of(expense_id) == {ALICE: 0, BOB: 0, CAROL: 1}


@pytest.mark.asyncio
async def test_create_expense_equal_split_without_participants_returns_422(client, store, wallet):
    authenticate(client, "alice")

    response = await client.post(f"/api/wallets/{wallet}/expenses", json=_equal(100, ALICE, []))

    assert response.status_code == 422
    assert store.expenses == {}


@pytest.mark.asyncio
async def test_create_expense_equal_split_with_duplicate_participant_returns_422(
    client, store, wallet
):
    authenticate(client, "alice")

    body = _equal(100, ALICE, [ALICE, BOB, BOB])
    response = await client.post(f"/api/wallets/{wallet}/expenses", json=body)

    assert response.status_code == 422
    assert store.expenses == {}


# ── 指定金額 ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_expense_custom_split_keeps_given_amounts_and_order(client, store, wallet):
    authenticate(client, "bob")

    body = _custom(1000, ALICE, [(CAROL, 700), (BOB, 300)])
    expense_id = await _create(client, wallet, body)

    assert store.expenses[expense_id]["split_mode"] == "custom"
    assert list(store.shares_of(expense_id).items()) == [(CAROL, 700), (BOB, 300)]


@pytest.mark.asyncio
async def test_create_expense_custom_split_not_summing_to_amount_returns_422(
    client, store, wallet
):
    authenticate(client, "alice")

    body = _custom(1000, ALICE, [(ALICE, 600), (BOB, 300)])
    response = await client.post(f"/api/wallets/{wallet}/expenses", json=body)

    assert response.status_code == 422
    assert store.expenses == {}


@pytest.mark.asyncio
async def test_create_expense_custom_split_with_zero_share_returns_422(client, store, wallet):
    authenticate(client, "alice")

    body = _custom(1000, ALICE, [(ALICE, 1000), (BOB, 0)])
    response = await client.post(f"/api/wallets/{wallet}/expenses", json=body)

    assert response.status_code == 422
    assert store.expenses == {}


@pytest.mark.asyncio
async def test_create_expense_custom_split_with_duplicate_user_returns_422(client, store, wallet):
    authenticate(client, "alice")

    body = _custom(1000, ALICE, [(BOB, 500), (BOB, 500)])
    response = await client.post(f"/api/wallets/{wallet}/expenses", json=body)

    assert response.status_code == 422
    assert store.expenses == {}


@pytest.mark.asyncio
async def test_create_expense_custom_split_without_shares_returns_422(client, store, wallet):
    authenticate(client, "alice")

    response = await client.post(f"/api/wallets/{wallet}/expenses", json=_custom(100, ALICE, []))

    assert response.status_code == 422


# ── 付款人、分攤對象與錢包 ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_expense_with_non_member_payer_returns_400(client, store, wallet):
    authenticate(client, "alice")

    body = _equal(100, SUPER, [ALICE, BOB])
    response = await client.post(f"/api/wallets/{wallet}/expenses", json=body)

    assert response.status_code == 400
    assert store.expenses == {}


@pytest.mark.asyncio
async def test_create_expense_with_non_member_participant_returns_400(client, store, wallet):
    authenticate(client, "alice")

    body = _custom(100, ALICE, [(ALICE, 50), (SUPER, 50)])
    response = await client.post(f"/api/wallets/{wallet}/expenses", json=body)

    assert response.status_code == 400
    assert store.expenses == {}


@pytest.mark.asyncio
async def test_create_expense_in_general_wallet_returns_400(client, store):
    general = store.add_wallet(members={ALICE: MemberRole.ADMIN})
    authenticate(client, "alice")

    response = await client.post(f"/api/wallets/{general}/expenses", json=_equal(100, ALICE, [ALICE]))

    assert response.status_code == 400
    assert store.expenses == {}


@pytest.mark.asyncio
async def test_list_expenses_in_general_wallet_returns_400(client, store):
    general = store.add_wallet(members={ALICE: MemberRole.ADMIN})
    authenticate(client, "alice")

    response = await client.get(f"/api/wallets/{general}/expenses")

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_create_expense_as_non_member_returns_404(client, store):
    other = store.add_wallet(kind=WalletKind.TRAVEL, members={BOB: MemberRole.ADMIN})
    authenticate(client, "alice")

    response = await client.post(f"/api/wallets/{other}/expenses", json=_equal(100, BOB, [BOB]))

    assert response.status_code == 404
    assert store.expenses == {}


@pytest.mark.asyncio
async def test_create_expense_locks_wallet(client, store, wallet):
    """與移除成員用同一個鎖: 不然移除的同時記進一筆, 就留下不是成員的分攤對象。"""
    authenticate(client, "alice")

    await _create(client, wallet, _equal(100, ALICE, [ALICE]))

    assert wallet in store.locked


@pytest.mark.asyncio
async def test_create_expense_with_overflowing_amount_returns_422(client, store, wallet):
    authenticate(client, "alice")

    response = await client.post(f"/api/wallets/{wallet}/expenses", json=_equal(2**53, ALICE, [ALICE]))

    assert response.status_code == 422


# ── 異動紀錄 ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_expense_records_log_with_payer_and_shares(client, store, wallet):
    authenticate(client, "bob")

    expense_id = await _create(client, wallet, _custom(100, ALICE, [(BOB, 60), (CAROL, 40)]))

    [log] = store.logs
    assert (log["entry_id"], log["action"], log["actor_id"]) == (expense_id, "create", BOB)
    assert (log["before"], log["as_super_admin"]) == (None, False)
    assert log["after"] == {
        "amount": 100,
        "payer_name": "Alice",
        "split_mode": "custom",
        "shares": [{"name": "Bob", "amount": 60}, {"name": "Carol", "amount": 40}],
        "entry_date": DAY,
        "note": "",
    }


@pytest.mark.asyncio
async def test_create_expense_as_super_admin_non_member_marks_log(client, store, wallet):
    authenticate(client, "super")

    await _create(client, wallet, _equal(100, ALICE, [ALICE]))

    [log] = store.logs
    assert (log["actor_id"], log["as_super_admin"]) == (SUPER, True)


# ── 修改 ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_own_expense_replaces_payer_and_shares(client, store, wallet):
    expense_id = store.add_expense(wallet, BOB, BOB, {BOB: 50, CAROL: 50})
    authenticate(client, "bob")

    body = _equal(90, CAROL, [ALICE, BOB, CAROL], note="改過")
    response = await client.patch(f"/api/wallets/{wallet}/expenses/{expense_id}", json=body)

    assert response.status_code == 200
    expense = store.expenses[expense_id]
    assert (expense["amount"], expense["payer_id"], expense["split_mode"]) == (90, CAROL, "equal")
    assert expense["note"] == "改過"
    assert store.shares_of(expense_id) == {ALICE: 30, BOB: 30, CAROL: 30}
    [log] = store.logs
    assert log["action"] == "update"
    assert log["before"]["shares"] == [{"name": "Bob", "amount": 50}, {"name": "Carol", "amount": 50}]
    assert log["after"]["payer_name"] == "Carol"


@pytest.mark.asyncio
async def test_update_expense_of_other_as_member_returns_403(client, store, wallet):
    expense_id = store.add_expense(wallet, ALICE, ALICE, {ALICE: 100})
    authenticate(client, "bob")

    body = _equal(200, ALICE, [ALICE])
    response = await client.patch(f"/api/wallets/{wallet}/expenses/{expense_id}", json=body)

    assert response.status_code == 403
    assert store.expenses[expense_id]["amount"] == 100


@pytest.mark.asyncio
async def test_update_expense_of_other_as_admin_succeeds(client, store, wallet):
    expense_id = store.add_expense(wallet, BOB, BOB, {BOB: 100})
    authenticate(client, "alice")

    body = _equal(200, BOB, [BOB])
    response = await client.patch(f"/api/wallets/{wallet}/expenses/{expense_id}", json=body)

    assert response.status_code == 200
    assert store.shares_of(expense_id) == {BOB: 200}


@pytest.mark.asyncio
async def test_update_expense_without_change_returns_204_and_no_log(client, store, wallet):
    expense_id = store.add_expense(
        wallet, ALICE, ALICE, {ALICE: 50, BOB: 50}, split_mode=SplitMode.EQUAL
    )
    authenticate(client, "alice")

    body = _equal(100, ALICE, [BOB, ALICE], note="")
    response = await client.patch(f"/api/wallets/{wallet}/expenses/{expense_id}", json=body)

    assert response.status_code == 204
    assert store.logs == []


@pytest.mark.asyncio
async def test_update_expense_with_non_member_participant_returns_400(client, store, wallet):
    expense_id = store.add_expense(wallet, ALICE, ALICE, {ALICE: 100})
    authenticate(client, "alice")

    body = _custom(100, ALICE, [(SUPER, 100)])
    response = await client.patch(f"/api/wallets/{wallet}/expenses/{expense_id}", json=body)

    assert response.status_code == 400
    assert store.shares_of(expense_id) == {ALICE: 100}


@pytest.mark.asyncio
async def test_update_expense_of_other_wallet_returns_404(client, store, wallet):
    other = store.add_wallet(kind=WalletKind.TRAVEL, members={ALICE: MemberRole.ADMIN})
    expense_id = store.add_expense(other, ALICE, ALICE, {ALICE: 100})
    authenticate(client, "alice")

    body = _equal(200, ALICE, [ALICE])
    response = await client.patch(f"/api/wallets/{wallet}/expenses/{expense_id}", json=body)

    assert response.status_code == 404
    assert store.expenses[expense_id]["amount"] == 100


# ── 刪除 ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_own_expense_removes_it_and_records_log(client, store, wallet):
    expense_id = store.add_expense(wallet, BOB, ALICE, {ALICE: 40, BOB: 60}, note="計程車")
    authenticate(client, "bob")

    response = await client.delete(f"/api/wallets/{wallet}/expenses/{expense_id}")

    assert response.status_code == 200
    assert store.expenses == {}
    [log] = store.logs
    assert (log["action"], log["after"]) == ("delete", None)
    assert log["before"]["note"] == "計程車"


@pytest.mark.asyncio
async def test_delete_expense_of_other_as_member_returns_403(client, store, wallet):
    expense_id = store.add_expense(wallet, ALICE, ALICE, {ALICE: 100})
    authenticate(client, "bob")

    response = await client.delete(f"/api/wallets/{wallet}/expenses/{expense_id}")

    assert response.status_code == 403
    assert expense_id in store.expenses


@pytest.mark.asyncio
async def test_delete_unknown_expense_returns_404(client, store, wallet):
    authenticate(client, "alice")

    response = await client.delete(f"/api/wallets/{wallet}/expenses/{CAROL}")

    assert response.status_code == 404


# ── 列表與淨額 ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_expenses_returns_payer_shares_and_recorder_nicknames(client, store, wallet):
    store.add_expense(wallet, BOB, ALICE, {ALICE: 40, CAROL: 60}, note="早餐")
    authenticate(client, "carol")

    response = await client.get(f"/api/wallets/{wallet}/expenses")

    assert response.status_code == 200
    [item] = response.json()["list_data"]
    assert item["amount"] == 100
    assert item["payer"] == {"user_id": ALICE, "nickname": "Alice"}
    assert item["split_mode"] == "custom"
    assert item["shares"] == [
        {"user_id": ALICE, "nickname": "Alice", "amount": 40},
        {"user_id": CAROL, "nickname": "Carol", "amount": 60},
    ]
    assert (item["note"], item["entry_date"]) == ("早餐", DAY)
    assert item["created_by"] == {"user_id": BOB, "nickname": "Bob"}
    assert response.json()["next_cursor"] is None


@pytest.mark.asyncio
async def test_get_net_balances_lists_every_member_in_join_order(client, store, wallet):
    store.add_expense(wallet, ALICE, ALICE, {ALICE: 300, BOB: 300, CAROL: 300})
    store.add_expense(wallet, BOB, BOB, {ALICE: 100, BOB: 100})
    authenticate(client, "carol")

    response = await client.get(f"/api/wallets/{wallet}/net-balances")

    assert response.status_code == 200
    assert response.json()["list_data"] == [
        {"user_id": ALICE, "nickname": "Alice", "paid": 900, "owed": 400, "net": 500},
        {"user_id": BOB, "nickname": "Bob", "paid": 200, "owed": 400, "net": -200},
        {"user_id": CAROL, "nickname": "Carol", "paid": 0, "owed": 300, "net": -300},
    ]


@pytest.mark.asyncio
async def test_get_net_balances_without_expenses_returns_zero_for_everyone(client, store, wallet):
    authenticate(client, "alice")

    body = (await client.get(f"/api/wallets/{wallet}/net-balances")).json()

    assert [(row["user_id"], row["net"]) for row in body["list_data"]] == [
        (ALICE, 0),
        (BOB, 0),
        (CAROL, 0),
    ]


@pytest.mark.asyncio
async def test_get_net_balances_in_general_wallet_returns_400(client, store):
    general = store.add_wallet(members={ALICE: MemberRole.ADMIN})
    authenticate(client, "alice")

    response = await client.get(f"/api/wallets/{general}/net-balances")

    assert response.status_code == 400


# ── 讀異動紀錄 ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_expense_logs_includes_deleted_expense(client, store, wallet):
    authenticate(client, "alice")
    expense_id = await _create(client, wallet, _equal(100, ALICE, [ALICE, BOB]))
    await client.delete(f"/api/wallets/{wallet}/expenses/{expense_id}")
    authenticate(client, "bob")

    response = await client.get(f"/api/wallets/{wallet}/expenses/{expense_id}/logs")

    assert response.status_code == 200
    logs = response.json()["list_data"]
    assert [log["action"] for log in logs] == ["delete", "create"]
    assert logs[0]["actor"] == {"user_id": ALICE, "nickname": "Alice"}
    assert logs[1]["after"]["shares"] == [
        {"name": "Alice", "amount": 50},
        {"name": "Bob", "amount": 50},
    ]


@pytest.mark.asyncio
async def test_list_expense_logs_of_unknown_expense_returns_404(client, store, wallet):
    authenticate(client, "alice")

    response = await client.get(f"/api/wallets/{wallet}/expenses/{CAROL}/logs")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_list_wallet_expense_logs_returns_newest_first(client, store, wallet):
    authenticate(client, "alice")
    first = await _create(client, wallet, _equal(100, ALICE, [ALICE]))
    second = await _create(client, wallet, _equal(200, BOB, [BOB]))

    response = await client.get(f"/api/wallets/{wallet}/expense-logs")

    assert response.status_code == 200
    assert [log["entry_id"] for log in response.json()["list_data"]] == [second, first]


@pytest.mark.asyncio
async def test_list_wallet_expense_logs_in_general_wallet_returns_400(client, store):
    general = store.add_wallet(members={ALICE: MemberRole.ADMIN})
    authenticate(client, "alice")

    response = await client.get(f"/api/wallets/{general}/expense-logs")

    assert response.status_code == 400
