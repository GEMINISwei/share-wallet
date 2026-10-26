"""邀請連結 (`modules/wallets/invites.py`): 產生、查看、撤銷、預覽與加入。

規則見 docs/features.md〈邀請連結〉〈加入流程〉。
"""

from datetime import timedelta

import pytest
from httpx import AsyncClient

from modules.wallets.model import MemberRole, WalletKind

from ..helpers import authenticate
from .conftest import ALICE, BOB, CAROL, FakeStore

ADMIN, MEMBER = MemberRole.ADMIN, MemberRole.MEMBER


def _invite_url(wallet_id: str) -> str:
    return f"/api/wallets/{wallet_id}/invite"


async def _create(client: AsyncClient, wallet_id: str, as_user: str = "alice") -> str:
    authenticate(client, as_user)
    response = await client.post(_invite_url(wallet_id))
    assert response.status_code == 200
    return response.json()["token"]


@pytest.mark.asyncio
async def test_create_invite_as_admin_expires_in_one_day(client: AsyncClient, store: FakeStore):
    wallet_id = store.add_wallet()
    authenticate(client, "alice")

    body = (await client.post(_invite_url(wallet_id))).json()

    assert len(body["token"]) >= 32
    assert body["expires_at"] == (store.now + timedelta(days=1)).isoformat() + "Z"
    assert store.invites[wallet_id]["token"] == body["token"]


@pytest.mark.asyncio
async def test_create_invite_as_super_admin_succeeds(client: AsyncClient, store: FakeStore):
    wallet_id = store.add_wallet()
    authenticate(client, "super")

    response = await client.post(_invite_url(wallet_id))

    assert response.status_code == 200
    assert wallet_id in store.invites


@pytest.mark.asyncio
async def test_create_invite_as_member_returns_403(client: AsyncClient, store: FakeStore):
    wallet_id = store.add_wallet(members={ALICE: ADMIN, BOB: MEMBER})
    authenticate(client, "bob")

    response = await client.post(_invite_url(wallet_id))

    assert response.status_code == 403
    assert store.invites == {}


@pytest.mark.asyncio
async def test_create_invite_as_outsider_returns_404(client: AsyncClient, store: FakeStore):
    wallet_id = store.add_wallet()
    authenticate(client, "bob")

    assert (await client.post(_invite_url(wallet_id))).status_code == 404


@pytest.mark.asyncio
async def test_get_invite_as_member_returns_403(client: AsyncClient, store: FakeStore):
    wallet_id = store.add_wallet(members={ALICE: ADMIN, BOB: MEMBER})
    await _create(client, wallet_id)
    authenticate(client, "bob")

    assert (await client.get(_invite_url(wallet_id))).status_code == 403


@pytest.mark.asyncio
async def test_get_invite_as_admin_returns_current_link(client: AsyncClient, store: FakeStore):
    wallet_id = store.add_wallet()
    token = await _create(client, wallet_id)

    body = (await client.get(_invite_url(wallet_id))).json()

    assert body["invite"]["token"] == token


@pytest.mark.asyncio
async def test_get_invite_after_expiry_returns_none(client: AsyncClient, store: FakeStore):
    wallet_id = store.add_wallet()
    await _create(client, wallet_id)
    store.now += timedelta(days=1)

    body = (await client.get(_invite_url(wallet_id))).json()

    assert body == {"invite": None}


@pytest.mark.asyncio
async def test_regenerate_invite_invalidates_old_token(client: AsyncClient, store: FakeStore):
    wallet_id = store.add_wallet()
    old = await _create(client, wallet_id)
    new = await _create(client, wallet_id)

    assert new != old
    assert (await client.get(f"/api/invites/{old}")).status_code == 404
    assert (await client.get(f"/api/invites/{new}")).status_code == 200


@pytest.mark.asyncio
async def test_revoke_invite_makes_token_invalid(client: AsyncClient, store: FakeStore):
    wallet_id = store.add_wallet()
    token = await _create(client, wallet_id)

    response = await client.delete(_invite_url(wallet_id))

    assert response.status_code == 200
    assert (await client.get(f"/api/invites/{token}")).status_code == 404


@pytest.mark.asyncio
async def test_revoke_invite_as_member_returns_403(client: AsyncClient, store: FakeStore):
    wallet_id = store.add_wallet(members={ALICE: ADMIN, BOB: MEMBER})
    await _create(client, wallet_id)
    authenticate(client, "bob")

    assert (await client.delete(_invite_url(wallet_id))).status_code == 403
    assert wallet_id in store.invites


@pytest.mark.asyncio
async def test_preview_invite_returns_wallet_summary(client: AsyncClient, store: FakeStore):
    wallet_id = store.add_wallet(
        kind=WalletKind.TRAVEL, name="東京", members={ALICE: ADMIN, BOB: MEMBER}
    )
    token = await _create(client, wallet_id)
    authenticate(client, "carol")

    body = (await client.get(f"/api/invites/{token}")).json()

    assert body == {
        "wallet_id": wallet_id,
        "kind": "travel",
        "name": "東京",
        "destination": "東京",
        "start_date": "2026-11-01",
        "end_date": "2026-11-05",
        "member_count": 2,
        "is_member": False,
    }


@pytest.mark.asyncio
async def test_preview_invite_as_member_marks_is_member(client: AsyncClient, store: FakeStore):
    wallet_id = store.add_wallet(members={ALICE: ADMIN, BOB: MEMBER})
    token = await _create(client, wallet_id)
    authenticate(client, "bob")

    body = (await client.get(f"/api/invites/{token}")).json()

    assert body["is_member"] is True


@pytest.mark.asyncio
async def test_preview_invite_with_unknown_token_returns_404(client: AsyncClient, store):
    authenticate(client, "bob")

    assert (await client.get("/api/invites/not-a-real-token")).status_code == 404


@pytest.mark.asyncio
async def test_preview_invite_with_expired_token_returns_404(client: AsyncClient, store):
    wallet_id = store.add_wallet()
    token = await _create(client, wallet_id)
    store.now += timedelta(days=1, seconds=1)
    authenticate(client, "bob")

    assert (await client.get(f"/api/invites/{token}")).status_code == 404


@pytest.mark.asyncio
async def test_preview_invite_without_login_returns_401(client: AsyncClient, store):
    wallet_id = store.add_wallet()
    token = await _create(client, wallet_id)
    client.cookies.clear()

    assert (await client.get(f"/api/invites/{token}")).status_code == 401


@pytest.mark.asyncio
async def test_accept_invite_adds_user_as_member(client: AsyncClient, store: FakeStore):
    wallet_id = store.add_wallet()
    token = await _create(client, wallet_id)
    authenticate(client, "bob")

    response = await client.post(f"/api/invites/{token}/accept")

    assert response.json() == {"id": wallet_id}
    assert store.roles(wallet_id) == {ALICE: ADMIN, BOB: MEMBER}


@pytest.mark.asyncio
async def test_accept_invite_as_existing_admin_keeps_role(client: AsyncClient, store):
    wallet_id = store.add_wallet()
    token = await _create(client, wallet_id)

    response = await client.post(f"/api/invites/{token}/accept")

    assert response.status_code == 200
    assert store.roles(wallet_id) == {ALICE: ADMIN}


@pytest.mark.asyncio
async def test_accept_invite_with_expired_token_returns_404(client: AsyncClient, store):
    wallet_id = store.add_wallet()
    token = await _create(client, wallet_id)
    store.now += timedelta(days=2)
    authenticate(client, "bob")

    response = await client.post(f"/api/invites/{token}/accept")

    assert response.status_code == 404
    assert BOB not in store.roles(wallet_id)


@pytest.mark.asyncio
async def test_accept_invite_after_removal_rejoins_as_member(client: AsyncClient, store):
    wallet_id = store.add_wallet(members={ALICE: ADMIN, CAROL: ADMIN})
    token = await _create(client, wallet_id)
    await client.delete(f"/api/wallets/{wallet_id}/members/{CAROL}")
    authenticate(client, "carol")

    response = await client.post(f"/api/invites/{token}/accept")

    assert response.status_code == 200
    assert store.roles(wallet_id)[CAROL] is MEMBER


@pytest.mark.asyncio
async def test_accept_invite_places_wallet_in_the_default_group_of_its_kind(
    client: AsyncClient, store: FakeStore
):
    wallet_id = store.add_wallet(kind=WalletKind.TRAVEL)
    token = await _create(client, wallet_id)
    authenticate(client, "bob")

    await client.post(f"/api/invites/{token}/accept")

    assert store.placement(wallet_id, BOB) == {
        "group_id": store.default_group(BOB, WalletKind.TRAVEL),
        "is_hidden": False,
    }


@pytest.mark.asyncio
async def test_rejoining_after_leaving_goes_back_to_the_default_group_and_is_shown(
    client: AsyncClient, store: FakeStore
):
    wallet_id = store.add_wallet(members={ALICE: ADMIN, CAROL: MEMBER})
    store.placements[(wallet_id, CAROL)] = {
        "group_id": store.add_group(CAROL, "日本"),
        "is_hidden": True,
    }
    token = await _create(client, wallet_id)
    await client.delete(f"/api/wallets/{wallet_id}/members/{CAROL}")
    authenticate(client, "carol")

    await client.post(f"/api/invites/{token}/accept")

    assert store.placement(wallet_id, CAROL) == {
        "group_id": store.default_group(CAROL),
        "is_hidden": False,
    }
