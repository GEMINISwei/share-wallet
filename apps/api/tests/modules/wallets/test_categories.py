"""一般錢包的分類 (`modules/wallets/categories.py`): 名稱唯一、改名、封存、旅遊錢包沒有分類。"""

import pytest
from httpx import AsyncClient

from modules.wallets.model import CategoryType, MemberRole, WalletKind

from ..helpers import authenticate
from .conftest import ALICE, BOB, FakeStore


@pytest.fixture
def wallet_id(store: FakeStore) -> str:
    return store.add_wallet(members={ALICE: MemberRole.ADMIN, BOB: MemberRole.MEMBER})


def _names(store: FakeStore, wallet_id: str) -> list[tuple[str, str]]:
    return [(c["type"], c["name"]) for c in store.active_categories(wallet_id)]


@pytest.mark.asyncio
async def test_list_categories_as_member_returns_categories(client: AsyncClient, store, wallet_id):
    food = store.add_category(wallet_id, "餐飲")
    store.add_category(wallet_id, "舊的", archived=True)
    authenticate(client, "bob")

    body = (await client.get(f"/api/wallets/{wallet_id}/categories")).json()

    assert body["list_data"] == [{"id": food, "type": "expense", "name": "餐飲"}]


@pytest.mark.asyncio
async def test_create_category_strips_name(client: AsyncClient, store, wallet_id):
    authenticate(client, "alice")

    response = await client.post(
        f"/api/wallets/{wallet_id}/categories", json={"type": "income", "name": "  紅包 "}
    )

    assert response.status_code == 200
    assert _names(store, wallet_id) == [(CategoryType.INCOME, "紅包")]


@pytest.mark.asyncio
async def test_create_category_with_duplicate_name_returns_409(
    client: AsyncClient, store, wallet_id
):
    store.add_category(wallet_id, "餐飲")
    authenticate(client, "alice")

    response = await client.post(
        f"/api/wallets/{wallet_id}/categories", json={"type": "expense", "name": " 餐飲 "}
    )

    assert response.status_code == 409
    assert len(store.active_categories(wallet_id)) == 1


@pytest.mark.asyncio
async def test_create_category_same_name_other_type_succeeds(
    client: AsyncClient, store, wallet_id
):
    store.add_category(wallet_id, "其他", CategoryType.EXPENSE)
    authenticate(client, "alice")

    response = await client.post(
        f"/api/wallets/{wallet_id}/categories", json={"type": "income", "name": "其他"}
    )

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_create_category_with_archived_name_succeeds(client: AsyncClient, store, wallet_id):
    store.add_category(wallet_id, "餐飲", archived=True)
    authenticate(client, "alice")

    response = await client.post(
        f"/api/wallets/{wallet_id}/categories", json={"type": "expense", "name": "餐飲"}
    )

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_create_category_with_long_name_returns_422(client: AsyncClient, store, wallet_id):
    authenticate(client, "alice")

    response = await client.post(
        f"/api/wallets/{wallet_id}/categories", json={"type": "expense", "name": "長" * 21}
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_rename_category_changes_name(client: AsyncClient, store, wallet_id):
    food = store.add_category(wallet_id, "餐飲")
    authenticate(client, "alice")

    response = await client.patch(
        f"/api/wallets/{wallet_id}/categories/{food}", json={"name": "外食", "type": "income"}
    )

    assert response.status_code == 200
    # 類型建立後不能改: 請求裡多帶的 type 被忽略。
    assert _names(store, wallet_id) == [(CategoryType.EXPENSE, "外食")]


@pytest.mark.asyncio
async def test_rename_category_to_duplicate_returns_409(client: AsyncClient, store, wallet_id):
    store.add_category(wallet_id, "餐飲")
    traffic = store.add_category(wallet_id, "交通")
    authenticate(client, "alice")

    response = await client.patch(
        f"/api/wallets/{wallet_id}/categories/{traffic}", json={"name": "餐飲"}
    )

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_rename_archived_category_returns_404(client: AsyncClient, store, wallet_id):
    old = store.add_category(wallet_id, "舊的", archived=True)
    authenticate(client, "alice")

    response = await client.patch(
        f"/api/wallets/{wallet_id}/categories/{old}", json={"name": "新的"}
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_category_of_other_wallet_returns_404(client: AsyncClient, store, wallet_id):
    other_wallet = store.add_wallet()
    foreign = store.add_category(other_wallet, "餐飲")
    authenticate(client, "alice")

    response = await client.delete(f"/api/wallets/{wallet_id}/categories/{foreign}")

    assert response.status_code == 404
    assert store.categories[foreign]["archived_at"] is None


@pytest.mark.asyncio
async def test_delete_category_archives_it(client: AsyncClient, store, wallet_id):
    food = store.add_category(wallet_id, "餐飲")
    authenticate(client, "alice")

    response = await client.delete(f"/api/wallets/{wallet_id}/categories/{food}")

    assert response.status_code == 200
    assert store.active_categories(wallet_id) == []
    # 資料列還在: 舊帳要能顯示原本的名稱。
    assert store.categories[food]["archived_at"] is not None


@pytest.mark.asyncio
async def test_category_routes_on_travel_wallet_return_400(client: AsyncClient, store):
    wallet_id = store.add_wallet(kind=WalletKind.TRAVEL)
    authenticate(client, "alice")

    listed = await client.get(f"/api/wallets/{wallet_id}/categories")
    created = await client.post(
        f"/api/wallets/{wallet_id}/categories", json={"type": "expense", "name": "餐飲"}
    )

    assert (listed.status_code, created.status_code) == (400, 400)
    assert store.categories == {}
