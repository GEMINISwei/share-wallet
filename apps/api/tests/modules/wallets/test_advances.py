"""代墊與還款 (`modules/wallets/advances.py`): 餘額與未還金額一起更新, 未還永遠不能是負的。

還款對的是某一筆代墊 (見 docs/features.md〈代墊與還款〉)。對象的唯一約束、還款指向代墊的外鍵與
刪錢包時的 cascade 在 `test_model.py` 對真的 PostgreSQL 驗。
"""

import pytest
from httpx import AsyncClient

from modules.wallets.model import EntryKind, MemberRole, WalletKind
from modules.wallets.schema import MAX_SAFE_AMOUNT

from ..helpers import authenticate
from .conftest import ALICE, BOB, FakeStore

DAY = "2026-10-18"


@pytest.fixture
def wallet(store: FakeStore) -> str:
    """Alice 是管理者、Bob 是成員, 餘額 1000。"""
    return store.add_wallet(balance=1000, members={ALICE: MemberRole.ADMIN, BOB: MemberRole.MEMBER})


def _advance(target_name: str = "小明", amount: int = 500, **extra) -> dict:
    return {"target_name": target_name, "amount": amount, "entry_date": DAY, **extra}


def _money(amount: int, **extra) -> dict:
    """修改代墊、新增或修改還款的內容: 金額、日期、備註。"""
    return {"amount": amount, "entry_date": DAY, **extra}


async def _create_advance(client: AsyncClient, wallet: str, body: dict) -> str:
    response = await client.post(f"/api/wallets/{wallet}/advances", json=body)
    assert response.status_code == 200, response.json()
    return response.json()["id"]


async def _repay(client: AsyncClient, wallet: str, advance_id: str, amount: int) -> str:
    response = await client.post(
        f"/api/wallets/{wallet}/advances/{advance_id}/repayments", json=_money(amount)
    )
    assert response.status_code == 200, response.json()
    return response.json()["id"]


# ── 代墊 ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_advance_deducts_balance_and_adds_outstanding(client, store, wallet):
    authenticate(client, "bob")

    entry_id = await _create_advance(client, wallet, _advance("小明", 500, note="晚餐"))

    entry = store.entries[entry_id]
    assert (entry["kind"], entry["amount"], entry["outstanding"]) == (EntryKind.ADVANCE, 500, 500)
    assert (entry["note"], entry["category_id"], entry["created_by"]) == ("晚餐", None, BOB)
    assert store.balance(wallet) == 500
    assert store.outstanding_of(wallet, "小明") == 500


@pytest.mark.asyncio
async def test_create_advance_strips_target_name_and_reuses_target(client, store, wallet):
    authenticate(client, "bob")

    first = await _create_advance(client, wallet, _advance("小明", 300))
    second = await _create_advance(client, wallet, _advance("  小明 ", 200))

    assert store.entries[first]["advance_target_id"] == store.entries[second]["advance_target_id"]
    assert len(store.targets) == 1
    assert store.outstanding_of(wallet, "小明") == 500


@pytest.mark.asyncio
async def test_create_advance_target_name_is_case_sensitive(client, store, wallet):
    authenticate(client, "bob")

    await _create_advance(client, wallet, _advance("Amy", 300))
    await _create_advance(client, wallet, _advance("amy", 200))

    assert store.outstanding_of(wallet, "Amy") == 300
    assert store.outstanding_of(wallet, "amy") == 200


@pytest.mark.asyncio
async def test_create_advance_with_blank_target_name_returns_422(client, store, wallet):
    authenticate(client, "bob")

    response = await client.post(f"/api/wallets/{wallet}/advances", json=_advance("   "))

    assert response.status_code == 422
    assert store.entries == {}


@pytest.mark.asyncio
async def test_create_advance_records_log_with_target_name(client, store, wallet):
    authenticate(client, "bob")

    entry_id = await _create_advance(client, wallet, _advance("小明", 500, note="晚餐"))

    [log] = store.logs
    assert (log["entry_id"], log["action"], log["actor_id"]) == (entry_id, "create", BOB)
    assert log["before"] is None
    assert log["after"] == {
        "kind": "advance",
        "amount": 500,
        "category_name": None,
        "counterpart_wallet_name": None,
        "advance_target_name": "小明",
        "entry_date": DAY,
        "note": "晚餐",
    }


@pytest.mark.asyncio
async def test_create_advance_overflowing_balance_returns_400(client, store, wallet):
    store.wallets[wallet]["balance"] = -MAX_SAFE_AMOUNT + 100
    authenticate(client, "bob")

    response = await client.post(f"/api/wallets/{wallet}/advances", json=_advance(amount=101))

    assert response.status_code == 400
    assert response.json()["detail"] == "餘額超出可記錄的範圍"
    assert store.entries == {}


@pytest.mark.asyncio
async def test_create_advance_in_travel_wallet_returns_400(client, store):
    trip = store.add_wallet(WalletKind.TRAVEL, members={BOB: MemberRole.MEMBER})
    authenticate(client, "bob")

    response = await client.post(f"/api/wallets/{trip}/advances", json=_advance())

    assert response.status_code == 400
    assert store.entries == {}


@pytest.mark.asyncio
async def test_update_advance_applies_difference_to_balance_and_outstanding(client, store, wallet):
    entry_id = store.add_advance(wallet, BOB, "小明", 500, outstanding=300)
    store.add_repayment(wallet, BOB, entry_id, 200)
    authenticate(client, "bob")

    response = await client.patch(
        f"/api/wallets/{wallet}/advances/{entry_id}", json=_money(800, note="改")
    )

    assert response.status_code == 200
    entry = store.entries[entry_id]
    assert (entry["amount"], entry["outstanding"], entry["note"]) == (800, 600, "改")
    assert store.balance(wallet) == 700
    assert store.outstanding_of(wallet, "小明") == 600
    assert store.logs[-1]["before"]["amount"] == 500
    assert store.logs[-1]["after"]["advance_target_name"] == "小明"


@pytest.mark.asyncio
async def test_update_advance_down_to_repaid_amount_succeeds(client, store, wallet):
    entry_id = store.add_advance(wallet, BOB, "小明", 500, outstanding=300)
    store.add_repayment(wallet, BOB, entry_id, 200)
    authenticate(client, "bob")

    response = await client.patch(f"/api/wallets/{wallet}/advances/{entry_id}", json=_money(200))

    assert response.status_code == 200
    assert store.entries[entry_id]["outstanding"] == 0
    assert store.outstanding_of(wallet, "小明") == 0
    assert store.balance(wallet) == 1300


@pytest.mark.asyncio
async def test_update_advance_below_repaid_amount_returns_400(client, store, wallet):
    entry_id = store.add_advance(wallet, BOB, "小明", 500, outstanding=300)
    store.add_repayment(wallet, BOB, entry_id, 200)
    authenticate(client, "bob")

    response = await client.patch(f"/api/wallets/{wallet}/advances/{entry_id}", json=_money(199))

    assert response.status_code == 400
    assert response.json()["detail"] == "代墊金額不可小於已還的金額"
    assert store.entries[entry_id]["amount"] == 500
    assert store.balance(wallet) == 1000


@pytest.mark.asyncio
async def test_update_advance_without_change_returns_204(client, store, wallet):
    entry_id = store.add_advance(wallet, BOB, "小明", 500)
    authenticate(client, "bob")

    response = await client.patch(f"/api/wallets/{wallet}/advances/{entry_id}", json=_money(500))

    assert response.status_code == 204
    assert store.logs == []


@pytest.mark.asyncio
async def test_update_advance_of_others_as_member_returns_403(client, store, wallet):
    entry_id = store.add_advance(wallet, ALICE, "小明", 500)
    authenticate(client, "bob")

    response = await client.patch(f"/api/wallets/{wallet}/advances/{entry_id}", json=_money(100))

    assert response.status_code == 403
    assert store.entries[entry_id]["amount"] == 500


@pytest.mark.asyncio
async def test_update_advance_of_others_as_admin_succeeds(client, store, wallet):
    entry_id = store.add_advance(wallet, BOB, "小明", 500)
    authenticate(client, "alice")

    response = await client.patch(f"/api/wallets/{wallet}/advances/{entry_id}", json=_money(100))

    assert response.status_code == 200
    assert store.outstanding_of(wallet, "小明") == 100


@pytest.mark.asyncio
async def test_update_advance_on_other_kind_returns_400(client, store, wallet):
    expense = store.add_entry(wallet, BOB, kind=EntryKind.EXPENSE, amount=100)
    advance = store.add_advance(wallet, BOB, "小明", 500, outstanding=300)
    repayment = store.add_repayment(wallet, BOB, advance, 200)
    authenticate(client, "bob")

    for entry_id in (expense, repayment):
        response = await client.patch(
            f"/api/wallets/{wallet}/advances/{entry_id}", json=_money(100)
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "代墊與還款不能與其他類型互相切換"


@pytest.mark.asyncio
async def test_update_entry_on_advance_or_repayment_returns_400(client, store, wallet):
    advance = store.add_advance(wallet, BOB, "小明", 500, outstanding=300)
    repayment = store.add_repayment(wallet, BOB, advance, 200)
    food = store.add_category(wallet, "餐飲")
    body = {"kind": "expense", "amount": 100, "category_id": food, "entry_date": DAY}
    authenticate(client, "bob")

    for entry_id in (advance, repayment):
        response = await client.patch(f"/api/wallets/{wallet}/entries/{entry_id}", json=body)
        assert response.status_code == 400
        assert response.json()["detail"] == "代墊與還款不能與其他類型互相切換"
    assert store.entries[advance]["kind"] == EntryKind.ADVANCE


@pytest.mark.asyncio
async def test_delete_advance_restores_balance_and_outstanding(client, store, wallet):
    authenticate(client, "bob")
    entry_id = await _create_advance(client, wallet, _advance("小明", 500))

    response = await client.delete(f"/api/wallets/{wallet}/entries/{entry_id}")

    assert response.status_code == 200
    assert entry_id not in store.entries
    assert store.balance(wallet) == 1000
    assert store.outstanding_of(wallet, "小明") == 0
    assert store.logs[-1]["action"] == "delete"
    assert store.logs[-1]["before"]["advance_target_name"] == "小明"


@pytest.mark.asyncio
async def test_delete_advance_with_repayments_returns_400(client, store, wallet):
    entry_id = store.add_advance(wallet, BOB, "小明", 500, outstanding=300)
    store.add_repayment(wallet, BOB, entry_id, 200)
    authenticate(client, "bob")

    response = await client.delete(f"/api/wallets/{wallet}/entries/{entry_id}")

    assert response.status_code == 400
    assert response.json()["detail"] == "這筆代墊已有還款，請先刪除還款"
    assert entry_id in store.entries
    assert store.balance(wallet) == 1000


# ── 還款 ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_repayment_adds_balance_and_reduces_outstanding(client, store, wallet):
    advance = store.add_advance(wallet, BOB, "小明", 500)
    authenticate(client, "bob")

    entry_id = await _repay(client, wallet, advance, 200)

    entry = store.entries[entry_id]
    assert (entry["kind"], entry["amount"], entry["advance_id"]) == (
        EntryKind.REPAYMENT,
        200,
        advance,
    )
    assert entry["advance_target_id"] == store.entries[advance]["advance_target_id"]
    assert store.entries[advance]["outstanding"] == 300
    assert store.balance(wallet) == 1200
    assert store.outstanding_of(wallet, "小明") == 300
    assert store.logs[-1]["after"]["kind"] == "repayment"
    assert store.logs[-1]["after"]["advance_target_name"] == "小明"


@pytest.mark.asyncio
async def test_create_repayment_for_whole_outstanding_succeeds(client, store, wallet):
    advance = store.add_advance(wallet, BOB, "小明", 500, outstanding=300)
    store.add_repayment(wallet, BOB, advance, 200)
    authenticate(client, "bob")

    await _repay(client, wallet, advance, 300)

    assert store.entries[advance]["outstanding"] == 0
    assert store.outstanding_of(wallet, "小明") == 0


@pytest.mark.asyncio
async def test_create_repayment_exceeding_outstanding_returns_400(client, store, wallet):
    advance = store.add_advance(wallet, BOB, "小明", 500, outstanding=300)
    store.add_repayment(wallet, BOB, advance, 200)
    # 同一個對象的另一筆代墊不能拿來抵: 上限只看這一筆。
    store.add_advance(wallet, BOB, "小明", 1000)
    authenticate(client, "bob")

    response = await client.post(
        f"/api/wallets/{wallet}/advances/{advance}/repayments", json=_money(301)
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "還款不可超過未還金額"
    assert store.entries[advance]["outstanding"] == 300
    assert store.balance(wallet) == 1000


@pytest.mark.asyncio
async def test_create_repayment_on_others_advance_as_member_succeeds(client, store, wallet):
    advance = store.add_advance(wallet, ALICE, "小明", 500)
    authenticate(client, "bob")

    entry_id = await _repay(client, wallet, advance, 100)

    assert store.entries[entry_id]["created_by"] == BOB
    assert store.outstanding_of(wallet, "小明") == 400


@pytest.mark.asyncio
async def test_create_repayment_on_non_advance_returns_404(client, store, wallet):
    expense = store.add_entry(wallet, BOB, kind=EntryKind.EXPENSE, amount=100)
    other = store.add_wallet(name="別的", members={BOB: MemberRole.ADMIN})
    elsewhere = store.add_advance(other, BOB, "小明", 500)
    authenticate(client, "bob")

    for entry_id in (expense, elsewhere):
        response = await client.post(
            f"/api/wallets/{wallet}/advances/{entry_id}/repayments", json=_money(100)
        )
        assert response.status_code == 404
        assert response.json()["detail"] == "代墊不存在"
    assert store.balance(wallet) == 1000


@pytest.mark.asyncio
async def test_create_repayment_as_non_member_returns_404(client, store, wallet):
    advance = store.add_advance(wallet, ALICE, "小明", 500)
    authenticate(client, "carol")

    response = await client.post(
        f"/api/wallets/{wallet}/advances/{advance}/repayments", json=_money(100)
    )

    assert response.status_code == 404
    assert store.entries[advance]["outstanding"] == 500


@pytest.mark.asyncio
async def test_update_repayment_up_to_outstanding_plus_original_succeeds(client, store, wallet):
    advance = store.add_advance(wallet, BOB, "小明", 500, outstanding=300)
    repayment = store.add_repayment(wallet, BOB, advance, 200)
    authenticate(client, "bob")

    response = await client.patch(
        f"/api/wallets/{wallet}/repayments/{repayment}", json=_money(500, note="還清")
    )

    assert response.status_code == 200
    assert (store.entries[repayment]["amount"], store.entries[repayment]["note"]) == (500, "還清")
    assert store.entries[advance]["outstanding"] == 0
    assert store.outstanding_of(wallet, "小明") == 0
    assert store.balance(wallet) == 1300


@pytest.mark.asyncio
async def test_update_repayment_beyond_outstanding_plus_original_returns_400(client, store, wallet):
    advance = store.add_advance(wallet, BOB, "小明", 500, outstanding=300)
    repayment = store.add_repayment(wallet, BOB, advance, 200)
    authenticate(client, "bob")

    response = await client.patch(f"/api/wallets/{wallet}/repayments/{repayment}", json=_money(501))

    assert response.status_code == 400
    assert response.json()["detail"] == "還款不可超過未還金額"
    assert store.entries[repayment]["amount"] == 200


@pytest.mark.asyncio
async def test_update_repayment_of_others_as_member_returns_403(client, store, wallet):
    advance = store.add_advance(wallet, BOB, "小明", 500, outstanding=300)
    repayment = store.add_repayment(wallet, ALICE, advance, 200)
    authenticate(client, "bob")

    response = await client.patch(f"/api/wallets/{wallet}/repayments/{repayment}", json=_money(100))

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_update_repayment_on_other_kind_returns_400(client, store, wallet):
    advance = store.add_advance(wallet, BOB, "小明", 500)
    authenticate(client, "bob")

    response = await client.patch(f"/api/wallets/{wallet}/repayments/{advance}", json=_money(100))

    assert response.status_code == 400
    assert response.json()["detail"] == "代墊與還款不能與其他類型互相切換"


@pytest.mark.asyncio
async def test_delete_repayment_restores_outstanding_and_balance(client, store, wallet):
    advance = store.add_advance(wallet, BOB, "小明", 500)
    authenticate(client, "bob")
    repayment = await _repay(client, wallet, advance, 200)

    response = await client.delete(f"/api/wallets/{wallet}/entries/{repayment}")

    assert response.status_code == 200
    assert store.entries[advance]["outstanding"] == 500
    assert store.outstanding_of(wallet, "小明") == 500
    assert store.balance(wallet) == 1000


@pytest.mark.asyncio
async def test_delete_advance_after_deleting_its_repayments_succeeds(client, store, wallet):
    authenticate(client, "bob")
    advance = await _create_advance(client, wallet, _advance("小明", 500))
    repayment = await _repay(client, wallet, advance, 200)

    await client.delete(f"/api/wallets/{wallet}/entries/{repayment}")
    response = await client.delete(f"/api/wallets/{wallet}/entries/{advance}")

    assert response.status_code == 200
    assert store.entries == {}
    assert store.balance(wallet) == 1000
    assert store.outstanding_of(wallet, "小明") == 0


# ── 查詢 ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_advance_targets_returns_every_target_with_outstanding(client, store, wallet):
    store.add_advance(wallet, BOB, "小華", 1200)
    store.add_advance(wallet, BOB, "小明", 500, outstanding=0)
    store.add_advance(store.add_wallet(name="別的"), ALICE, "別人", 100)
    authenticate(client, "bob")

    response = await client.get(f"/api/wallets/{wallet}/advance-targets")

    assert response.status_code == 200
    assert response.json() == {
        "list_data": [{"name": "小明", "outstanding": 0}, {"name": "小華", "outstanding": 1200}],
        "count": 2,
    }


@pytest.mark.asyncio
async def test_list_repayments_returns_repayments_of_the_advance(client, store, wallet):
    advance = store.add_advance(wallet, BOB, "小明", 500, outstanding=200)
    first = store.add_repayment(wallet, BOB, advance, 100)
    second = store.add_repayment(wallet, ALICE, advance, 200)
    other = store.add_advance(wallet, BOB, "小明", 300, outstanding=200)
    store.add_repayment(wallet, BOB, other, 100)
    authenticate(client, "bob")

    response = await client.get(f"/api/wallets/{wallet}/advances/{advance}/repayments")

    assert response.status_code == 200
    body = response.json()
    assert [item["id"] for item in body["list_data"]] == [second, first]
    assert body["list_data"][0]["created_by"]["nickname"] == "Alice"
    assert body["list_data"][0]["advance_target_name"] == "小明"


@pytest.mark.asyncio
async def test_list_repayments_of_non_advance_returns_404(client, store, wallet):
    expense = store.add_entry(wallet, BOB, kind=EntryKind.EXPENSE, amount=100)
    authenticate(client, "bob")

    response = await client.get(f"/api/wallets/{wallet}/advances/{expense}/repayments")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_list_entries_includes_advance_fields(client, store, wallet):
    advance = store.add_advance(wallet, BOB, "小明", 500, outstanding=300)
    repayment = store.add_repayment(wallet, BOB, advance, 200)
    authenticate(client, "bob")

    response = await client.get(f"/api/wallets/{wallet}/entries")

    items = {item["id"]: item for item in response.json()["list_data"]}
    assert (items[advance]["advance_target_name"], items[advance]["outstanding"]) == ("小明", 300)
    assert items[advance]["advance_id"] is None
    assert (items[repayment]["advance_target_name"], items[repayment]["advance_id"]) == (
        "小明",
        advance,
    )
    assert items[repayment]["outstanding"] is None
