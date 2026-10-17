"""錢包成員 (`modules/wallets/members.py`): 升降、移除、離開與「至少一位管理者」。"""

import pytest
from httpx import AsyncClient

from modules.wallets.model import MemberRole

from ..helpers import authenticate
from .conftest import ALICE, BOB, CAROL, FakeStore

ADMIN, MEMBER = MemberRole.ADMIN, MemberRole.MEMBER


def _url(wallet_id: str, user_id: str) -> str:
    return f"/api/wallets/{wallet_id}/members/{user_id}"


@pytest.mark.asyncio
async def test_list_members_as_member_returns_nicknames_and_roles(
    client: AsyncClient, store: FakeStore
):
    wallet_id = store.add_wallet(members={ALICE: ADMIN, BOB: MEMBER})
    authenticate(client, "bob")

    body = (await client.get(f"/api/wallets/{wallet_id}/members")).json()

    assert body["list_data"] == [
        {"user_id": ALICE, "nickname": "Alice", "role": "admin"},
        {"user_id": BOB, "nickname": "Bob", "role": "member"},
    ]


@pytest.mark.asyncio
async def test_update_member_role_as_admin_promotes_member(client: AsyncClient, store):
    wallet_id = store.add_wallet(members={ALICE: ADMIN, BOB: MEMBER})
    authenticate(client, "alice")

    response = await client.patch(_url(wallet_id, BOB), json={"role": "admin"})

    assert response.status_code == 200
    assert store.roles(wallet_id) == {ALICE: ADMIN, BOB: ADMIN}


@pytest.mark.asyncio
async def test_update_member_role_as_admin_demotes_admin(client: AsyncClient, store):
    wallet_id = store.add_wallet(members={ALICE: ADMIN, BOB: ADMIN})
    authenticate(client, "alice")

    response = await client.patch(_url(wallet_id, BOB), json={"role": "member"})

    assert response.status_code == 200
    assert store.roles(wallet_id)[BOB] is MEMBER


@pytest.mark.asyncio
async def test_demote_last_admin_returns_409(client: AsyncClient, store):
    wallet_id = store.add_wallet(members={ALICE: ADMIN, BOB: MEMBER})
    authenticate(client, "alice")

    response = await client.patch(_url(wallet_id, ALICE), json={"role": "member"})

    assert response.status_code == 409
    assert store.roles(wallet_id)[ALICE] is ADMIN
    # 先鎖錢包再數管理者, 兩個管理者同時互降才不會都放行。
    assert store.locked == [wallet_id]


@pytest.mark.asyncio
async def test_demote_self_with_other_admin_succeeds(client: AsyncClient, store):
    wallet_id = store.add_wallet(members={ALICE: ADMIN, BOB: ADMIN})
    authenticate(client, "alice")

    response = await client.patch(_url(wallet_id, ALICE), json={"role": "member"})

    assert response.status_code == 200
    assert store.roles(wallet_id) == {ALICE: MEMBER, BOB: ADMIN}


@pytest.mark.asyncio
async def test_update_member_not_in_wallet_returns_404(client: AsyncClient, store):
    wallet_id = store.add_wallet(members={ALICE: ADMIN})
    authenticate(client, "alice")

    response = await client.patch(_url(wallet_id, CAROL), json={"role": "admin"})

    assert response.status_code == 404
    assert response.json()["detail"] == "成員不存在"
    assert CAROL not in store.roles(wallet_id)


@pytest.mark.asyncio
async def test_remove_member_as_admin_deletes_membership(client: AsyncClient, store):
    wallet_id = store.add_wallet(members={ALICE: ADMIN, BOB: MEMBER})
    authenticate(client, "alice")

    response = await client.delete(_url(wallet_id, BOB))

    assert response.status_code == 200
    assert store.roles(wallet_id) == {ALICE: ADMIN}


@pytest.mark.asyncio
async def test_remove_other_member_as_member_returns_403(client: AsyncClient, store):
    wallet_id = store.add_wallet(members={ALICE: ADMIN, BOB: MEMBER, CAROL: MEMBER})
    authenticate(client, "bob")

    response = await client.delete(_url(wallet_id, CAROL))

    assert response.status_code == 403
    assert CAROL in store.roles(wallet_id)


@pytest.mark.asyncio
async def test_leave_wallet_as_member_deletes_own_membership(client: AsyncClient, store):
    wallet_id = store.add_wallet(members={ALICE: ADMIN, BOB: MEMBER})
    authenticate(client, "bob")

    response = await client.delete(_url(wallet_id, BOB))

    assert response.status_code == 200
    assert store.roles(wallet_id) == {ALICE: ADMIN}


@pytest.mark.asyncio
async def test_leave_wallet_as_last_admin_returns_409(client: AsyncClient, store):
    wallet_id = store.add_wallet(members={ALICE: ADMIN, BOB: MEMBER})
    authenticate(client, "alice")

    response = await client.delete(_url(wallet_id, ALICE))

    assert response.status_code == 409
    assert ALICE in store.roles(wallet_id)


@pytest.mark.asyncio
async def test_leave_wallet_as_admin_with_other_admin_succeeds(client: AsyncClient, store):
    wallet_id = store.add_wallet(members={ALICE: ADMIN, BOB: ADMIN})
    authenticate(client, "alice")

    response = await client.delete(_url(wallet_id, ALICE))

    assert response.status_code == 200
    assert store.roles(wallet_id) == {BOB: ADMIN}


@pytest.mark.asyncio
async def test_remove_last_admin_returns_409(client: AsyncClient, store):
    """只有超級管理者 (不是成員) 才可能移除到最後一位管理者。"""
    wallet_id = store.add_wallet(members={ALICE: ADMIN, BOB: MEMBER})
    authenticate(client, "super")

    response = await client.delete(_url(wallet_id, ALICE))

    assert response.status_code == 409
    assert ALICE in store.roles(wallet_id)
