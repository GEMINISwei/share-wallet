"""旅遊錢包的結算 (`modules/wallets/settlement.py`): 清償方案、開始與取消結算、付款與確認。

規則見 docs/features.md〈結算流程〉〈封存〉。方案的算法是純函式, 直接測;
其他經過 API, 資料表換成 `conftest.py` 的 FakeStore。
"""

import random

import pytest
from httpx import AsyncClient

from modules.wallets.model import MemberRole, WalletKind, WalletStatus
from modules.wallets.settlement import plan_transfers

from ..helpers import authenticate
from .conftest import ALICE, BOB, CAROL, SUPER, FakeStore


def _plan(nets: list[tuple[str, int]]) -> list[tuple[str, str, int]]:
    return [(t["from_user_id"], t["to_user_id"], t["amount"]) for t in plan_transfers(nets)]


# ── 清償方案的算法 ──────────────────────────────────────────────────────────


def test_plan_transfers_pairs_equal_amounts_first():
    # 只配最大對最大會是 4 筆 (A 先付 C 5); 先配掉 B、C 這一對剩 3 筆。
    nets = [("a", -6), ("b", -5), ("c", 5), ("d", 4), ("e", 2)]

    assert _plan(nets) == [("a", "d", 4), ("a", "e", 2), ("b", "c", 5)]


def test_plan_transfers_pays_largest_debt_to_largest_credit():
    nets = [("a", -7), ("b", -3), ("c", 6), ("d", 4)]

    assert _plan(nets) == [("a", "c", 6), ("a", "d", 1), ("b", "d", 3)]


def test_plan_transfers_breaks_ties_by_join_order():
    nets = [("a", 3), ("b", -3), ("c", 3), ("d", -3)]

    assert _plan(nets) == [("b", "a", 3), ("d", "c", 3)]


def test_plan_transfers_with_all_zero_returns_empty():
    assert _plan([("a", 0), ("b", 0)]) == []


def test_plan_transfers_settles_everyone_within_people_minus_one():
    # 固定種子的隨機淨額, 只是產生測資, 不涉及安全。
    rng = random.Random(20261019)  # noqa: S311
    for _ in range(200):
        size = rng.randint(2, 30)
        values = [rng.randint(-5000, 5000) for _ in range(size - 1)]
        nets = [(f"u{i}", value) for i, value in enumerate([*values, -sum(values)])]

        transfers = plan_transfers(nets)

        left = dict(nets)
        for transfer in transfers:
            assert transfer["amount"] > 0
            left[transfer["from_user_id"]] += transfer["amount"]
            left[transfer["to_user_id"]] -= transfer["amount"]
        assert all(value == 0 for value in left.values())
        assert len(transfers) <= max(sum(value != 0 for _, value in nets) - 1, 0)


# ── 開始結算 ────────────────────────────────────────────────────────────────


@pytest.fixture
def wallet(store: FakeStore) -> str:
    """依序加入: Alice (管理者)、Bob、Carol。"""
    return store.add_wallet(
        kind=WalletKind.TRAVEL,
        name="東京",
        members={ALICE: MemberRole.ADMIN, BOB: MemberRole.MEMBER, CAROL: MemberRole.MEMBER},
    )


def _settling(store: FakeStore, wallet: str) -> str:
    """結算中, 方案只有一筆: Bob 付 Carol 300。"""
    store.wallets[wallet]["status"] = WalletStatus.SETTLING
    return store.add_settlement(wallet, BOB, CAROL, 300)


@pytest.mark.asyncio
async def test_start_settlement_as_admin_stores_plan_and_locks_ledger(client, store, wallet):
    store.add_expense(wallet, ALICE, ALICE, {ALICE: 100, BOB: 400, CAROL: 100})
    store.add_expense(wallet, CAROL, CAROL, {BOB: 200})
    authenticate(client, "alice")

    response = await client.post(f"/api/wallets/{wallet}/settlement")

    assert response.status_code == 200, response.json()
    assert response.json()["status"] == "settling"
    assert store.status(wallet) is WalletStatus.SETTLING
    plan = [(t["from_user_id"], t["to_user_id"], t["amount"]) for t in store.transfers_of(wallet)]
    assert plan == [(BOB, ALICE, 500), (BOB, CAROL, 100)]
    # 結算的操作不寫進異動紀錄 (異動紀錄只記帳目)。
    assert store.logs == []


@pytest.mark.asyncio
async def test_start_settlement_locks_wallet(client, store, wallet):
    authenticate(client, "alice")

    await client.post(f"/api/wallets/{wallet}/settlement")

    assert wallet in store.locked


@pytest.mark.asyncio
async def test_start_settlement_with_all_zero_settles_immediately(client, store, wallet):
    store.add_expense(wallet, ALICE, ALICE, {ALICE: 100})
    authenticate(client, "alice")

    response = await client.post(f"/api/wallets/{wallet}/settlement")

    assert response.status_code == 200
    assert response.json()["status"] == "settled"
    assert store.status(wallet) is WalletStatus.SETTLED
    assert store.transfers_of(wallet) == []


@pytest.mark.asyncio
async def test_start_settlement_as_member_returns_403(client, store, wallet):
    authenticate(client, "bob")

    response = await client.post(f"/api/wallets/{wallet}/settlement")

    assert response.status_code == 403
    assert store.status(wallet) is WalletStatus.ACTIVE


@pytest.mark.asyncio
async def test_start_settlement_as_super_admin_non_member_succeeds(client, store, wallet):
    store.add_expense(wallet, ALICE, ALICE, {BOB: 100})
    authenticate(client, "super")

    response = await client.post(f"/api/wallets/{wallet}/settlement")

    assert response.status_code == 200
    assert store.status(wallet) is WalletStatus.SETTLING


@pytest.mark.asyncio
async def test_start_settlement_in_general_wallet_returns_400(client, store):
    general = store.add_wallet()
    authenticate(client, "alice")

    response = await client.post(f"/api/wallets/{general}/settlement")

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_start_settlement_while_settling_returns_409(client, store, wallet):
    _settling(store, wallet)
    authenticate(client, "alice")

    response = await client.post(f"/api/wallets/{wallet}/settlement")

    assert response.status_code == 409
    assert len(store.transfers_of(wallet)) == 1


# ── 查看 ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_settlement_returns_transfers_with_nicknames(client, store, wallet):
    transfer_id = _settling(store, wallet)
    store.settlements[transfer_id].update(paid_at=store.now)
    authenticate(client, "carol")

    response = await client.get(f"/api/wallets/{wallet}/settlement")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "settling"
    assert body["transfers"] == [
        {
            "id": transfer_id,
            "payer": {"user_id": BOB, "nickname": "Bob"},
            "payee": {"user_id": CAROL, "nickname": "Carol"},
            "amount": 300,
            "paid_at": "2026-10-18T12:00:00Z",
            "confirmed_at": None,
            "confirmed_by": None,
        }
    ]


@pytest.mark.asyncio
async def test_get_settlement_while_active_returns_empty_plan(client, store, wallet):
    authenticate(client, "bob")

    response = await client.get(f"/api/wallets/{wallet}/settlement")

    assert response.json() == {"status": "active", "transfers": []}


@pytest.mark.asyncio
async def test_get_settlement_as_non_member_returns_404(client, store):
    other = store.add_wallet(kind=WalletKind.TRAVEL, members={BOB: MemberRole.ADMIN})
    authenticate(client, "alice")

    response = await client.get(f"/api/wallets/{other}/settlement")

    assert response.status_code == 404


# ── 取消結算 ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cancel_settlement_discards_plan_and_unlocks(client, store, wallet):
    transfer_id = _settling(store, wallet)
    store.settlements[transfer_id].update(confirmed_by=CAROL, confirmed_at=store.now)
    store.add_settlement(wallet, ALICE, CAROL, 100)
    authenticate(client, "alice")

    response = await client.delete(f"/api/wallets/{wallet}/settlement")

    assert response.status_code == 200
    assert response.json()["status"] == "active"
    assert store.status(wallet) is WalletStatus.ACTIVE
    assert store.transfers_of(wallet) == []
    assert wallet in store.locked


@pytest.mark.asyncio
async def test_cancel_settlement_as_member_returns_403(client, store, wallet):
    _settling(store, wallet)
    authenticate(client, "bob")

    response = await client.delete(f"/api/wallets/{wallet}/settlement")

    assert response.status_code == 403
    assert store.status(wallet) is WalletStatus.SETTLING


@pytest.mark.asyncio
async def test_cancel_settlement_while_active_returns_409(client, store, wallet):
    authenticate(client, "alice")

    response = await client.delete(f"/api/wallets/{wallet}/settlement")

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_cancel_settlement_of_settled_wallet_returns_409(client, store, wallet):
    store.wallets[wallet]["status"] = WalletStatus.SETTLED
    authenticate(client, "alice")

    response = await client.delete(f"/api/wallets/{wallet}/settlement")

    assert response.status_code == 409
    assert store.status(wallet) is WalletStatus.SETTLED


# ── 標記付款 ────────────────────────────────────────────────────────────────


def _paid_url(wallet: str, transfer_id: str) -> str:
    return f"/api/wallets/{wallet}/settlement/transfers/{transfer_id}/paid"


def _confirm_url(wallet: str, transfer_id: str) -> str:
    return f"/api/wallets/{wallet}/settlement/transfers/{transfer_id}/confirmation"


@pytest.mark.asyncio
async def test_mark_paid_as_payer_records_time(client, store, wallet):
    transfer_id = _settling(store, wallet)
    authenticate(client, "bob")

    response = await client.post(_paid_url(wallet, transfer_id))

    assert response.status_code == 200
    assert store.settlements[transfer_id]["paid_at"] == store.now
    assert wallet in store.locked


@pytest.mark.asyncio
async def test_mark_paid_as_admin_not_payer_returns_403(client, store, wallet):
    transfer_id = _settling(store, wallet)
    authenticate(client, "alice")

    response = await client.post(_paid_url(wallet, transfer_id))

    assert response.status_code == 403
    assert store.settlements[transfer_id]["paid_at"] is None


@pytest.mark.asyncio
async def test_mark_paid_with_unknown_transfer_returns_404(client, store, wallet):
    _settling(store, wallet)
    other = store.add_wallet(kind=WalletKind.TRAVEL, members={BOB: MemberRole.ADMIN})
    foreign = store.add_settlement(other, BOB, ALICE, 50)
    authenticate(client, "bob")

    response = await client.post(_paid_url(wallet, foreign))

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_mark_paid_in_settled_wallet_returns_409(client, store, wallet):
    transfer_id = store.add_settlement(wallet, BOB, CAROL, 300, confirmed_by=CAROL)
    store.wallets[wallet]["status"] = WalletStatus.SETTLED
    authenticate(client, "bob")

    response = await client.post(_paid_url(wallet, transfer_id))

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_unmark_paid_as_payer_clears_mark(client, store, wallet):
    transfer_id = _settling(store, wallet)
    store.settlements[transfer_id]["paid_at"] = store.now
    authenticate(client, "bob")

    response = await client.delete(_paid_url(wallet, transfer_id))

    assert response.status_code == 200
    assert store.settlements[transfer_id]["paid_at"] is None


@pytest.mark.asyncio
async def test_unmark_paid_after_confirmation_returns_409(client, store, wallet):
    transfer_id = _settling(store, wallet)
    store.add_settlement(wallet, ALICE, CAROL, 100)
    store.settlements[transfer_id].update(
        paid_at=store.now, confirmed_by=CAROL, confirmed_at=store.now
    )
    authenticate(client, "bob")

    response = await client.delete(_paid_url(wallet, transfer_id))

    assert response.status_code == 409
    assert store.settlements[transfer_id]["paid_at"] == store.now


# ── 確認收款 ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_confirm_without_paid_mark_as_payee_records_confirmer(client, store, wallet):
    transfer_id = _settling(store, wallet)
    store.add_settlement(wallet, ALICE, CAROL, 100)
    authenticate(client, "carol")

    response = await client.post(_confirm_url(wallet, transfer_id))

    assert response.status_code == 200
    assert response.json()["status"] == "settling"
    transfer = store.settlements[transfer_id]
    assert (transfer["confirmed_by"], transfer["confirmed_at"]) == (CAROL, store.now)


@pytest.mark.asyncio
async def test_confirm_as_admin_records_confirmer(client, store, wallet):
    transfer_id = _settling(store, wallet)
    store.add_settlement(wallet, ALICE, CAROL, 100)
    authenticate(client, "alice")

    response = await client.post(_confirm_url(wallet, transfer_id))

    assert response.status_code == 200
    assert store.settlements[transfer_id]["confirmed_by"] == ALICE


@pytest.mark.asyncio
async def test_confirm_as_payer_admin_returns_403(client, store, wallet):
    _settling(store, wallet)
    own = store.add_settlement(wallet, ALICE, CAROL, 100)
    authenticate(client, "alice")

    response = await client.post(_confirm_url(wallet, own))

    assert response.status_code == 403
    assert store.settlements[own]["confirmed_at"] is None


@pytest.mark.asyncio
async def test_confirm_as_other_member_returns_403(client, store, wallet):
    _settling(store, wallet)
    others = store.add_settlement(wallet, ALICE, CAROL, 100)
    authenticate(client, "bob")

    response = await client.post(_confirm_url(wallet, others))

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_confirm_last_transfer_settles_wallet(client, store, wallet):
    transfer_id = _settling(store, wallet)
    store.add_settlement(wallet, ALICE, CAROL, 100, confirmed_by=CAROL)
    authenticate(client, "carol")

    response = await client.post(_confirm_url(wallet, transfer_id))

    assert response.status_code == 200
    assert response.json()["status"] == "settled"
    assert store.status(wallet) is WalletStatus.SETTLED


@pytest.mark.asyncio
async def test_unconfirm_as_confirmer_keeps_paid_mark(client, store, wallet):
    transfer_id = _settling(store, wallet)
    store.add_settlement(wallet, ALICE, CAROL, 100)
    store.settlements[transfer_id].update(
        paid_at=store.now, confirmed_by=CAROL, confirmed_at=store.now
    )
    authenticate(client, "carol")

    response = await client.delete(_confirm_url(wallet, transfer_id))

    assert response.status_code == 200
    transfer = store.settlements[transfer_id]
    assert (transfer["confirmed_by"], transfer["confirmed_at"]) == (None, None)
    assert transfer["paid_at"] == store.now


@pytest.mark.asyncio
async def test_unconfirm_as_admin_succeeds(client, store, wallet):
    transfer_id = _settling(store, wallet)
    store.add_settlement(wallet, ALICE, CAROL, 100)
    store.settlements[transfer_id].update(confirmed_by=CAROL, confirmed_at=store.now)
    authenticate(client, "alice")

    response = await client.delete(_confirm_url(wallet, transfer_id))

    assert response.status_code == 200
    assert store.settlements[transfer_id]["confirmed_at"] is None


@pytest.mark.asyncio
async def test_unconfirm_as_other_member_returns_403(client, store, wallet):
    transfer_id = _settling(store, wallet)
    store.add_settlement(wallet, ALICE, CAROL, 100)
    store.settlements[transfer_id].update(confirmed_by=CAROL, confirmed_at=store.now)
    authenticate(client, "bob")

    response = await client.delete(_confirm_url(wallet, transfer_id))

    assert response.status_code == 403
    assert store.settlements[transfer_id]["confirmed_by"] == CAROL


@pytest.mark.asyncio
async def test_unconfirm_in_settled_wallet_returns_409(client, store, wallet):
    transfer_id = store.add_settlement(wallet, BOB, CAROL, 300, confirmed_by=CAROL)
    store.wallets[wallet]["status"] = WalletStatus.SETTLED
    authenticate(client, "carol")

    response = await client.delete(_confirm_url(wallet, transfer_id))

    assert response.status_code == 409
    assert store.settlements[transfer_id]["confirmed_by"] == CAROL


# ── 帳目鎖住 ────────────────────────────────────────────────────────────────


def _expense_body() -> dict:
    return {
        "split_mode": "equal",
        "amount": 100,
        "payer_id": ALICE,
        "participant_ids": [ALICE, BOB],
        "entry_date": "2026-11-02",
    }


@pytest.mark.asyncio
async def test_create_expense_while_settling_returns_409(client, store, wallet):
    _settling(store, wallet)
    authenticate(client, "alice")

    response = await client.post(f"/api/wallets/{wallet}/expenses", json=_expense_body())

    assert response.status_code == 409
    assert store.expenses == {}


@pytest.mark.asyncio
async def test_update_expense_in_settled_wallet_returns_409(client, store, wallet):
    expense_id = store.add_expense(wallet, ALICE, ALICE, {ALICE: 50, BOB: 50})
    store.wallets[wallet]["status"] = WalletStatus.SETTLED
    authenticate(client, "alice")

    response = await client.patch(
        f"/api/wallets/{wallet}/expenses/{expense_id}", json={**_expense_body(), "amount": 80}
    )

    assert response.status_code == 409
    assert store.expenses[expense_id]["amount"] == 100


@pytest.mark.asyncio
async def test_delete_expense_while_settling_returns_409(client, store, wallet):
    expense_id = store.add_expense(wallet, ALICE, ALICE, {ALICE: 50, BOB: 50})
    _settling(store, wallet)
    authenticate(client, "alice")

    response = await client.delete(f"/api/wallets/{wallet}/expenses/{expense_id}")

    assert response.status_code == 409
    assert expense_id in store.expenses


# ── 結算中與封存後的錢包 ────────────────────────────────────────────────────


def _travel_update() -> dict:
    return {
        "kind": "travel",
        "name": "大阪",
        "destination": "大阪",
        "start_date": "2026-11-01",
        "end_date": "2026-11-05",
    }


@pytest.mark.asyncio
async def test_update_wallet_while_settling_succeeds(client, store, wallet):
    _settling(store, wallet)
    authenticate(client, "alice")

    response = await client.patch(f"/api/wallets/{wallet}", json=_travel_update())

    assert response.status_code == 200
    assert store.wallets[wallet]["name"] == "大阪"


@pytest.mark.asyncio
async def test_update_settled_wallet_returns_409(client, store, wallet):
    store.wallets[wallet]["status"] = WalletStatus.SETTLED
    authenticate(client, "alice")

    response = await client.patch(f"/api/wallets/{wallet}", json=_travel_update())

    assert response.status_code == 409
    assert store.wallets[wallet]["name"] == "東京"


@pytest.mark.asyncio
async def test_delete_settled_wallet_succeeds(client, store, wallet):
    store.wallets[wallet]["status"] = WalletStatus.SETTLED
    authenticate(client, "alice")

    response = await client.delete(f"/api/wallets/{wallet}")

    assert response.status_code == 200
    assert wallet not in store.wallets


@pytest.mark.asyncio
async def test_update_member_role_in_settled_wallet_returns_409(client, store, wallet):
    store.wallets[wallet]["status"] = WalletStatus.SETTLED
    authenticate(client, "alice")

    response = await client.patch(
        f"/api/wallets/{wallet}/members/{BOB}", json={"role": "admin"}
    )

    assert response.status_code == 409
    assert store.members[(wallet, BOB)] is MemberRole.MEMBER


@pytest.mark.asyncio
async def test_remove_member_from_settled_wallet_returns_409(client, store, wallet):
    store.wallets[wallet]["status"] = WalletStatus.SETTLED
    authenticate(client, "alice")

    response = await client.delete(f"/api/wallets/{wallet}/members/{CAROL}")

    assert response.status_code == 409
    assert (wallet, CAROL) in store.members


@pytest.mark.asyncio
async def test_leave_settled_wallet_with_records_succeeds(client, store, wallet):
    store.add_expense(wallet, BOB, BOB, {ALICE: 100})
    store.wallets[wallet]["status"] = WalletStatus.SETTLED
    authenticate(client, "bob")

    response = await client.delete(f"/api/wallets/{wallet}/members/{BOB}")

    assert response.status_code == 200
    assert (wallet, BOB) not in store.members


@pytest.mark.asyncio
async def test_leave_settled_wallet_as_last_admin_returns_409(client, store, wallet):
    store.wallets[wallet]["status"] = WalletStatus.SETTLED
    authenticate(client, "alice")

    response = await client.delete(f"/api/wallets/{wallet}/members/{ALICE}")

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_leave_wallet_with_records_while_settling_returns_409(client, store, wallet):
    store.add_expense(wallet, BOB, BOB, {ALICE: 100})
    _settling(store, wallet)
    authenticate(client, "bob")

    response = await client.delete(f"/api/wallets/{wallet}/members/{BOB}")

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_get_net_balances_of_settled_wallet_includes_members_who_left(
    client, store, wallet
):
    store.add_expense(wallet, BOB, BOB, {ALICE: 100})
    store.wallets[wallet]["status"] = WalletStatus.SETTLED
    del store.members[(wallet, BOB)]
    authenticate(client, "alice")

    response = await client.get(f"/api/wallets/{wallet}/net-balances")

    nets = [(item["nickname"], item["net"]) for item in response.json()["list_data"]]
    assert nets == [("Alice", -100), ("Carol", 0), ("Bob", 100)]


@pytest.mark.asyncio
async def test_create_invite_in_settled_wallet_returns_409(client, store, wallet):
    store.wallets[wallet]["status"] = WalletStatus.SETTLED
    authenticate(client, "alice")

    response = await client.post(f"/api/wallets/{wallet}/invite")

    assert response.status_code == 409
    assert wallet not in store.invites


@pytest.mark.asyncio
async def test_get_invite_of_settled_wallet_returns_none(client, store, wallet):
    authenticate(client, "alice")
    await client.post(f"/api/wallets/{wallet}/invite")
    store.wallets[wallet]["status"] = WalletStatus.SETTLED

    response = await client.get(f"/api/wallets/{wallet}/invite")

    assert response.json() == {"invite": None}


@pytest.mark.asyncio
async def test_preview_invite_of_settled_wallet_returns_404(client, store, wallet):
    authenticate(client, "alice")
    token = (await client.post(f"/api/wallets/{wallet}/invite")).json()["token"]
    store.wallets[wallet]["status"] = WalletStatus.SETTLED
    authenticate(client, "super")

    response = await client.get(f"/api/invites/{token}")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_accept_invite_of_settled_wallet_returns_404(client, store, wallet):
    authenticate(client, "alice")
    token = (await client.post(f"/api/wallets/{wallet}/invite")).json()["token"]
    store.wallets[wallet]["status"] = WalletStatus.SETTLED
    authenticate(client, "super")

    response = await client.post(f"/api/invites/{token}/accept")

    assert response.status_code == 404
    assert (wallet, SUPER) not in store.members


@pytest.mark.asyncio
async def test_accept_invite_while_settling_adds_member(client, store, wallet):
    authenticate(client, "alice")
    token = (await client.post(f"/api/wallets/{wallet}/invite")).json()["token"]
    _settling(store, wallet)
    authenticate(client, "super")

    response = await client.post(f"/api/invites/{token}/accept")

    assert response.status_code == 200
    assert store.members[(wallet, SUPER)] is MemberRole.MEMBER


# ── 錢包列表 ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_wallets_puts_settled_wallets_last_with_status(client: AsyncClient, store):
    settled = store.add_wallet(kind=WalletKind.TRAVEL, name="去年", status=WalletStatus.SETTLED)
    settling = store.add_wallet(kind=WalletKind.TRAVEL, name="這次", status=WalletStatus.SETTLING)
    general = store.add_wallet(name="家用")
    authenticate(client, "alice")

    response = await client.get("/api/wallets/")

    items = [(item["id"], item["status"]) for item in response.json()["list_data"]]
    assert items == [(settling, "settling"), (general, "active"), (settled, "settled")]
