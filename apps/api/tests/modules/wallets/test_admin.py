"""後台的錢包端點 (`modules/wallets/admin.py`): 只給超級管理者, 列出所有錢包、替指定的使用者建立。

查看、修改、刪除、成員與分類走一般端點, 超級管理者等同管理者的授權在 `test_routes.py`。
"""

import pytest
from httpx import AsyncClient

from modules.wallets.model import CategoryType, MemberRole, WalletKind

from ..helpers import authenticate
from .conftest import ALICE, BOB, CAROL, DAVE, SUPER, FakeStore

MISSING_ID = "0123abcd-4567-89ab-cdef-0123456789ab"


def _general(admin_user_id: str, **extra) -> dict:
    return {"kind": "general", "name": "家用", "admin_user_id": admin_user_id, **extra}


@pytest.mark.asyncio
async def test_admin_wallet_routes_without_super_admin_return_403(client: AsyncClient, store):
    """一般帳號 (即使是某個錢包的管理者) 也進不了後台。"""
    store.add_wallet(members={ALICE: MemberRole.ADMIN})
    authenticate(client, "alice")

    listed = await client.get("/api/admin/wallets/?limit=10")
    created = await client.post("/api/admin/wallets/", json=_general(ALICE))

    assert listed.status_code == 403
    assert created.status_code == 403


@pytest.mark.asyncio
async def test_list_all_wallets_includes_wallets_not_joined(client: AsyncClient, store):
    joined_by_alice = store.add_wallet(name="家用", members={ALICE: MemberRole.ADMIN})
    joined_by_bob = store.add_wallet(name="旅費", members={BOB: MemberRole.ADMIN})
    authenticate(client, "super")

    response = await client.get("/api/admin/wallets/?limit=10")

    assert response.status_code == 200
    body = response.json()
    assert [item["id"] for item in body["list_data"]] == [joined_by_alice, joined_by_bob]
    assert body["total_count"] == 2


@pytest.mark.asyncio
async def test_list_all_wallets_returns_member_count_and_admins(client: AsyncClient, store):
    store.add_wallet(
        balance=1500,
        members={ALICE: MemberRole.ADMIN, BOB: MemberRole.MEMBER, CAROL: MemberRole.ADMIN},
    )
    authenticate(client, "super")

    item = (await client.get("/api/admin/wallets/?limit=10")).json()["list_data"][0]

    assert item["member_count"] == 3
    assert item["admins"] == [
        {"user_id": ALICE, "nickname": "Alice"},
        {"user_id": CAROL, "nickname": "Carol"},
    ]
    assert item["balance"] == 1500


@pytest.mark.asyncio
async def test_list_all_wallets_hides_travel_balance(client: AsyncClient, store):
    store.add_wallet(kind=WalletKind.TRAVEL, name="東京")
    authenticate(client, "super")

    item = (await client.get("/api/admin/wallets/?limit=10")).json()["list_data"][0]

    assert item["balance"] is None
    assert item["destination"] == "東京"


@pytest.mark.asyncio
async def test_list_all_wallets_with_unknown_kind_returns_422(client: AsyncClient, store):
    authenticate(client, "super")

    response = await client.get("/api/admin/wallets/?limit=10&kind=savings")

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_admin_create_wallet_makes_given_user_the_only_admin(
    client: AsyncClient, store: FakeStore
):
    """超級管理者沒有指定自己時不成為成員。"""
    authenticate(client, "super")

    response = await client.post("/api/admin/wallets/", json=_general(BOB, initial_balance=300))

    assert response.status_code == 200
    wallet_id = response.json()["id"]
    assert store.roles(wallet_id) == {BOB: MemberRole.ADMIN}
    assert store.wallets[wallet_id]["balance"] == 300


@pytest.mark.asyncio
async def test_admin_create_wallet_for_self_makes_super_admin_admin(client: AsyncClient, store):
    authenticate(client, "super")

    response = await client.post("/api/admin/wallets/", json=_general(SUPER))

    assert store.roles(response.json()["id"]) == {SUPER: MemberRole.ADMIN}


@pytest.mark.asyncio
async def test_admin_create_travel_wallet_has_no_categories(client: AsyncClient, store):
    authenticate(client, "super")

    response = await client.post(
        "/api/admin/wallets/",
        json={
            "kind": "travel",
            "name": "東京",
            "destination": "日本",
            "start_date": "2026-11-01",
            "end_date": "2026-11-05",
            "admin_user_id": ALICE,
        },
    )

    wallet_id = response.json()["id"]
    assert store.wallets[wallet_id]["destination"] == "日本"
    assert store.active_categories(wallet_id) == []


@pytest.mark.asyncio
@pytest.mark.parametrize("admin_user_id", [DAVE, MISSING_ID])
async def test_admin_create_wallet_with_disabled_or_unknown_user_returns_400(
    client: AsyncClient, store: FakeStore, admin_user_id: str
):
    authenticate(client, "super")

    response = await client.post("/api/admin/wallets/", json=_general(admin_user_id))

    assert response.status_code == 400
    assert response.json()["detail"] == "指定的管理者不存在或已停用"
    assert store.wallets == {}


@pytest.mark.asyncio
async def test_admin_create_wallet_without_admin_returns_422(client: AsyncClient, store):
    authenticate(client, "super")

    response = await client.post("/api/admin/wallets/", json={"kind": "general", "name": "家用"})

    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("language", "first_expense"), [("zh-TW", "餐飲"), ("en", "Food")]
)
async def test_admin_create_general_wallet_seeds_default_categories_in_request_language(
    client: AsyncClient, store: FakeStore, language: str, first_expense: str
):
    authenticate(client, "super")

    response = await client.post(
        "/api/admin/wallets/", json=_general(ALICE), headers={"Accept-Language": language}
    )

    expenses = [
        category["name"]
        for category in store.active_categories(response.json()["id"])
        if category["type"] == CategoryType.EXPENSE
    ]
    assert expenses[0] == first_expense
