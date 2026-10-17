"""錢包端點的授權: 只要登入、不看全站權限; 非成員 404、成員不能管理 403、超級管理者等同管理者。

業務規則在 `test_service.py`、`test_members.py`、`test_categories.py`。
"""

import pytest
from httpx import AsyncClient

from modules.wallets.model import MemberRole

from ..helpers import authenticate
from .conftest import ALICE, BOB, FakeStore


def _routes(wallet_id: str, category_id: str) -> dict[str, list[tuple[str, str, dict | None]]]:
    base = f"/api/wallets/{wallet_id}"
    category = f"{base}/categories/{category_id}"
    read: list[tuple[str, str, dict | None]] = [
        ("GET", base, None),
        ("GET", f"{base}/members", None),
        ("GET", f"{base}/categories", None),
    ]
    manage: list[tuple[str, str, dict | None]] = [
        ("PATCH", base, {"kind": "general", "name": "改名"}),
        ("DELETE", base, None),
        ("PATCH", f"{base}/members/{BOB}", {"role": "admin"}),
        ("DELETE", f"{base}/members/{BOB}", None),
        ("POST", f"{base}/categories", {"type": "expense", "name": "寵物"}),
        ("PATCH", category, {"name": "外食"}),
        ("DELETE", category, None),
    ]
    return {"read": read, "manage": manage}


@pytest.fixture
def wallet(store: FakeStore) -> tuple[str, str]:
    wallet_id = store.add_wallet(members={ALICE: MemberRole.ADMIN, BOB: MemberRole.MEMBER})
    return wallet_id, store.add_category(wallet_id, "餐飲")


@pytest.mark.asyncio
async def test_wallet_routes_without_token_return_401(client: AsyncClient, wallet):
    routes = _routes(*wallet)
    for method, url, body in [("GET", "/api/wallets/", None), *routes["read"], *routes["manage"]]:
        response = await client.request(method, url, json=body)

        assert response.status_code == 401, (method, url)


@pytest.mark.asyncio
async def test_create_wallet_without_site_permission_succeeds(client: AsyncClient, store):
    """一般用戶角色的權限是空的, 照樣有完整的錢包功能。"""
    authenticate(client, "carol")

    response = await client.post("/api/wallets/", json={"kind": "general", "name": "我的"})

    assert response.status_code == 200
    assert store.wallets[response.json()["id"]]["name"] == "我的"


@pytest.mark.asyncio
async def test_wallet_routes_as_non_member_return_404(client: AsyncClient, wallet):
    routes = _routes(*wallet)
    authenticate(client, "carol")

    for method, url, body in [*routes["read"], *routes["manage"]]:
        response = await client.request(method, url, json=body)

        assert response.status_code == 404, (method, url)
        assert response.json()["detail"] == "錢包不存在"


@pytest.mark.asyncio
async def test_get_unknown_wallet_returns_404(client: AsyncClient, store):
    authenticate(client, "super")

    response = await client.get("/api/wallets/0123abcd-4567-89ab-cdef-0123456789ab")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_wallet_routes_as_member_can_read(client: AsyncClient, wallet):
    authenticate(client, "bob")

    for method, url, body in _routes(*wallet)["read"]:
        response = await client.request(method, url, json=body)

        assert response.status_code == 200, (method, url)


@pytest.mark.asyncio
async def test_wallet_admin_routes_as_member_return_403(client: AsyncClient, store, wallet):
    authenticate(client, "bob")
    before = (dict(store.wallets), dict(store.members), len(store.categories))

    for method, url, body in _routes(*wallet)["manage"]:
        # 移除自己 (BOB) 是離開, 每個成員都可以, 不在這張表的範圍。
        if method == "DELETE" and url.endswith(f"/members/{BOB}"):
            continue
        response = await client.request(method, url, json=body)

        assert response.status_code == 403, (method, url)

    assert (dict(store.wallets), dict(store.members), len(store.categories)) == before


@pytest.mark.asyncio
async def test_wallet_admin_routes_as_super_admin_non_member_succeed(
    client: AsyncClient, store, wallet
):
    """超級管理者沒有加入也等同管理者; 刪除錢包放最後, 前面的操作才有錢包可以改。"""
    authenticate(client, "super")

    for method, url, body in [*_routes(*wallet)["read"], *_routes(*wallet)["manage"]]:
        if method == "DELETE" and url.endswith(f"/members/{BOB}"):
            continue
        if method == "DELETE" and url == f"/api/wallets/{wallet[0]}":
            continue
        response = await client.request(method, url, json=body)

        assert response.status_code == 200, (method, url, response.text)

    response = await client.delete(f"/api/wallets/{wallet[0]}")
    assert response.status_code == 200
    assert wallet[0] not in store.wallets


@pytest.mark.asyncio
async def test_get_wallet_as_super_admin_non_member_has_no_role_but_can_manage(
    client: AsyncClient, wallet
):
    authenticate(client, "super")

    body = (await client.get(f"/api/wallets/{wallet[0]}")).json()

    assert body["my_role"] is None
    assert body["can_manage"] is True


@pytest.mark.asyncio
async def test_wallet_routes_with_malformed_id_return_422(client: AsyncClient, store):
    authenticate(client, "alice")

    response = await client.get("/api/wallets/not-a-uuid")

    assert response.status_code == 422
