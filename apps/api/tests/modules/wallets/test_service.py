"""錢包本身 (`modules/wallets/service.py`): 建立、列表、修改設定、刪除。"""

import pytest
from httpx import AsyncClient

from modules.wallets.model import CategoryType, MemberRole, WalletKind

from ..helpers import authenticate
from .conftest import ALICE, BOB, SUPER, FakeStore

TRAVEL = {
    "kind": "travel",
    "name": "東京",
    "destination": "日本",
    "start_date": "2026-11-01",
    "end_date": "2026-11-05",
}


@pytest.mark.asyncio
async def test_create_general_wallet_makes_creator_the_only_admin(
    client: AsyncClient, store: FakeStore
):
    authenticate(client, "alice")

    response = await client.post("/api/wallets/", json={"kind": "general", "name": "家用"})

    assert store.roles(response.json()["id"]) == {ALICE: MemberRole.ADMIN}


@pytest.mark.asyncio
async def test_create_general_wallet_stores_initial_balance(client: AsyncClient, store):
    authenticate(client, "alice")

    response = await client.post(
        "/api/wallets/", json={"kind": "general", "name": "信用卡", "initial_balance": -1200}
    )

    assert store.wallets[response.json()["id"]]["balance"] == -1200


@pytest.mark.asyncio
async def test_create_general_wallet_defaults_balance_to_zero(client: AsyncClient, store):
    authenticate(client, "alice")

    response = await client.post("/api/wallets/", json={"kind": "general", "name": "家用"})

    assert store.wallets[response.json()["id"]]["balance"] == 0


@pytest.mark.asyncio
async def test_create_wallet_with_unsafe_amount_returns_422(client: AsyncClient, store):
    """超過 2^53-1 的整數送到瀏覽器會失真。"""
    authenticate(client, "alice")

    response = await client.post(
        "/api/wallets/", json={"kind": "general", "name": "家用", "initial_balance": 2**53}
    )

    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("language", "income", "expense"),
    [
        (
            "zh-TW",
            ["薪資", "獎金", "投資", "其他"],
            ["餐飲", "交通", "購物", "居家", "娛樂", "醫療", "其他"],
        ),
        (
            "en",
            ["Salary", "Bonus", "Investment", "Other"],
            ["Food", "Transport", "Shopping", "Home", "Entertainment", "Medical", "Other"],
        ),
    ],
)
async def test_create_general_wallet_seeds_default_categories_in_request_language(
    client: AsyncClient, store, language, income, expense
):
    authenticate(client, "alice")

    response = await client.post(
        "/api/wallets/",
        json={"kind": "general", "name": "家用"},
        headers={"Accept-Language": language},
    )

    categories = store.active_categories(response.json()["id"])
    assert [c["name"] for c in categories if c["type"] is CategoryType.INCOME] == income
    assert [c["name"] for c in categories if c["type"] is CategoryType.EXPENSE] == expense


@pytest.mark.asyncio
async def test_create_travel_wallet_has_no_categories(client: AsyncClient, store):
    authenticate(client, "alice")

    response = await client.post("/api/wallets/", json=TRAVEL)

    wallet = store.wallets[response.json()["id"]]
    assert wallet["destination"] == "日本"
    assert str(wallet["start_date"]) == "2026-11-01"
    assert store.active_categories(wallet["id"]) == []


@pytest.mark.asyncio
async def test_create_travel_wallet_without_destination_returns_422(client: AsyncClient, store):
    authenticate(client, "alice")

    response = await client.post("/api/wallets/", json={**TRAVEL, "destination": "  "})

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_travel_wallet_with_end_before_start_returns_422(client: AsyncClient, store):
    authenticate(client, "alice")

    response = await client.post("/api/wallets/", json={**TRAVEL, "end_date": "2026-10-31"})

    assert response.status_code == 422
    assert "結束日不可早於開始日" in response.text
    assert store.wallets == {}


@pytest.mark.asyncio
async def test_create_travel_wallet_ending_on_start_day_succeeds(client: AsyncClient, store):
    authenticate(client, "alice")

    response = await client.post("/api/wallets/", json={**TRAVEL, "end_date": "2026-11-01"})

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_list_wallets_returns_only_joined_wallets(client: AsyncClient, store):
    mine = store.add_wallet(name="我的", members={ALICE: MemberRole.MEMBER})
    store.add_wallet(name="別人的", members={BOB: MemberRole.ADMIN})
    authenticate(client, "alice")

    body = (await client.get("/api/wallets/")).json()

    assert [wallet["id"] for wallet in body["list_data"]] == [mine]
    assert body["list_data"][0]["my_role"] == "member"
    assert body["list_data"][0]["can_manage"] is False


@pytest.mark.asyncio
async def test_list_wallets_as_super_admin_returns_only_joined_wallets(client: AsyncClient, store):
    joined = store.add_wallet(members={SUPER: MemberRole.MEMBER})
    store.add_wallet(members={BOB: MemberRole.ADMIN})
    authenticate(client, "super")

    body = (await client.get("/api/wallets/")).json()

    assert [wallet["id"] for wallet in body["list_data"]] == [joined]
    assert body["list_data"][0]["can_manage"] is True


@pytest.mark.asyncio
async def test_list_wallets_total_balance_sums_general_wallets_only(client: AsyncClient, store):
    store.add_wallet(balance=1000)
    store.add_wallet(balance=-300)
    store.add_wallet(kind=WalletKind.TRAVEL, balance=999)
    store.add_wallet(balance=5000, members={BOB: MemberRole.ADMIN})
    authenticate(client, "alice")

    body = (await client.get("/api/wallets/")).json()

    assert body["total_balance"] == 700
    assert body["count"] == 3
    travel = next(wallet for wallet in body["list_data"] if wallet["kind"] == "travel")
    assert travel["balance"] is None


@pytest.mark.asyncio
async def test_update_general_wallet_changes_name(client: AsyncClient, store):
    wallet_id = store.add_wallet(name="家用")
    authenticate(client, "alice")

    response = await client.patch(
        f"/api/wallets/{wallet_id}", json={"kind": "general", "name": " 家計 "}
    )

    assert response.status_code == 200
    assert store.wallets[wallet_id]["name"] == "家計"


@pytest.mark.asyncio
async def test_update_travel_wallet_changes_destination_and_dates(client: AsyncClient, store):
    wallet_id = store.add_wallet(kind=WalletKind.TRAVEL)
    authenticate(client, "alice")

    response = await client.patch(
        f"/api/wallets/{wallet_id}",
        json={**TRAVEL, "destination": "大阪", "end_date": "2026-11-08"},
    )

    assert response.status_code == 200
    assert store.wallets[wallet_id]["destination"] == "大阪"
    assert str(store.wallets[wallet_id]["end_date"]) == "2026-11-08"


@pytest.mark.asyncio
async def test_update_travel_wallet_with_end_before_start_returns_422(client: AsyncClient, store):
    wallet_id = store.add_wallet(kind=WalletKind.TRAVEL)
    authenticate(client, "alice")

    response = await client.patch(
        f"/api/wallets/{wallet_id}", json={**TRAVEL, "end_date": "2026-10-01"}
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_update_wallet_with_other_kind_returns_400(client: AsyncClient, store):
    wallet_id = store.add_wallet(kind=WalletKind.GENERAL)
    authenticate(client, "alice")

    response = await client.patch(f"/api/wallets/{wallet_id}", json=TRAVEL)

    assert response.status_code == 400
    assert store.wallets[wallet_id]["kind"] is WalletKind.GENERAL


@pytest.mark.asyncio
async def test_delete_wallet_as_admin_deletes_it_regardless_of_balance(client: AsyncClient, store):
    wallet_id = store.add_wallet(balance=12345)
    authenticate(client, "alice")

    response = await client.delete(f"/api/wallets/{wallet_id}")

    assert response.status_code == 200
    assert wallet_id not in store.wallets
