"""錢包群組 (`modules/wallets/groups.py`): 每個人自己的分組、排序與顯示。

規則見 docs/features/wallets.md〈錢包群組〉。
"""

import pytest
from httpx import AsyncClient

from modules.wallets.model import MemberRole, WalletKind

from ..helpers import authenticate
from .conftest import ALICE, BOB, FakeStore

GENERAL = WalletKind.GENERAL
TRAVEL = WalletKind.TRAVEL


async def _groups(client: AsyncClient) -> list[dict]:
    response = await client.get("/api/wallet-groups/")
    assert response.status_code == 200
    return response.json()["list_data"]


@pytest.mark.asyncio
async def test_group_routes_without_token_return_401(client: AsyncClient, store: FakeStore):
    group_id = store.add_group(ALICE, "日本")
    wallet_id = store.add_wallet()
    routes: list[tuple[str, str, dict | None]] = [
        ("GET", "/api/wallet-groups/", None),
        ("POST", "/api/wallet-groups/", {"kind": "general", "name": "台幣"}),
        ("PATCH", f"/api/wallet-groups/{group_id}", {"name": "日圓"}),
        ("DELETE", f"/api/wallet-groups/{group_id}", None),
        ("POST", f"/api/wallet-groups/{group_id}/move", {"direction": "up"}),
        ("PATCH", f"/api/wallets/{wallet_id}/group", {"group_id": group_id}),
        ("PATCH", f"/api/wallets/{wallet_id}/visibility", {"is_hidden": True}),
    ]
    for method, url, body in routes:
        response = await client.request(method, url, json=body)

        assert response.status_code == 401, (method, url)


@pytest.mark.asyncio
async def test_list_groups_creates_both_defaults_for_a_new_user(
    client: AsyncClient, store: FakeStore
):
    authenticate(client, "bob")

    groups = await _groups(client)

    assert [(g["kind"], g["name"], g["is_default"]) for g in groups] == [
        ("general", None, True),
        ("travel", None, True),
    ]


@pytest.mark.asyncio
async def test_list_groups_orders_general_first_then_by_position(
    client: AsyncClient, store: FakeStore
):
    store.add_group(ALICE, "日本", TRAVEL)
    store.add_group(ALICE, "台幣")
    authenticate(client, "alice")

    groups = await _groups(client)

    assert [g["name"] for g in groups] == [None, "台幣", None, "日本"]


@pytest.mark.asyncio
async def test_list_groups_totals_only_visible_general_wallets(
    client: AsyncClient, store: FakeStore
):
    shown = store.add_wallet(balance=300)
    hidden = store.add_wallet(balance=5000)
    store.add_wallet(balance=20)
    store.placement(hidden, ALICE)["is_hidden"] = True
    authenticate(client, "alice")

    general = (await _groups(client))[0]

    assert store.placement(shown, ALICE)["is_hidden"] is False
    assert (general["wallet_count"], general["visible_count"]) == (3, 2)
    assert general["total_balance"] == 320


@pytest.mark.asyncio
async def test_list_groups_has_no_total_for_travel_groups(client: AsyncClient, store: FakeStore):
    store.add_wallet(kind=TRAVEL)
    authenticate(client, "alice")

    travel = (await _groups(client))[1]

    assert travel["visible_count"] == 1
    assert travel["total_balance"] is None


@pytest.mark.asyncio
async def test_create_group_is_placed_before_the_default_of_the_same_kind(
    client: AsyncClient, store: FakeStore
):
    authenticate(client, "alice")

    response = await client.post("/api/wallet-groups/", json={"kind": "general", "name": " 日圓 "})

    assert response.status_code == 200
    assert store.groups[response.json()["id"]]["name"] == "日圓"
    assert store.group_order(ALICE) == ["日圓", None]
    assert store.group_order(ALICE, TRAVEL) == [None]


@pytest.mark.asyncio
async def test_create_group_goes_right_before_a_default_moved_to_the_top(
    client: AsyncClient, store: FakeStore
):
    # add_group 排在最後, 所以這時預設群組在最前面。
    store.add_group(ALICE, "台幣")
    authenticate(client, "alice")

    await client.post("/api/wallet-groups/", json={"kind": "general", "name": "日圓"})

    assert store.group_order(ALICE) == ["日圓", None, "台幣"]


@pytest.mark.asyncio
async def test_create_group_with_a_name_taken_in_the_same_kind_returns_409(
    client: AsyncClient, store: FakeStore
):
    store.add_group(ALICE, "日本")
    authenticate(client, "alice")

    response = await client.post("/api/wallet-groups/", json={"kind": "general", "name": "日本"})

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_create_group_allows_the_same_name_in_the_other_kind(
    client: AsyncClient, store: FakeStore
):
    store.add_group(ALICE, "日本")
    authenticate(client, "alice")

    response = await client.post("/api/wallet-groups/", json={"kind": "travel", "name": "日本"})

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_create_group_allows_a_name_another_user_already_uses(
    client: AsyncClient, store: FakeStore
):
    store.add_group(BOB, "日本")
    authenticate(client, "alice")

    response = await client.post("/api/wallet-groups/", json={"kind": "general", "name": "日本"})

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_create_group_beyond_twenty_per_kind_returns_409(
    client: AsyncClient, store: FakeStore
):
    # 預設群組也算在 20 個裡面。
    for index in range(19):
        store.add_group(ALICE, f"群組{index}")
    authenticate(client, "alice")

    full = await client.post("/api/wallet-groups/", json={"kind": "general", "name": "再一個"})
    other_kind = await client.post("/api/wallet-groups/", json={"kind": "travel", "name": "再一個"})

    assert full.status_code == 409
    assert other_kind.status_code == 200


@pytest.mark.asyncio
async def test_rename_group_trims_the_name(client: AsyncClient, store: FakeStore):
    group_id = store.add_group(ALICE, "日本")
    authenticate(client, "alice")

    response = await client.patch(f"/api/wallet-groups/{group_id}", json={"name": " 日圓 "})

    assert response.status_code == 200
    assert store.groups[group_id]["name"] == "日圓"


@pytest.mark.asyncio
async def test_rename_group_to_a_taken_name_returns_409(client: AsyncClient, store: FakeStore):
    store.add_group(ALICE, "台幣")
    group_id = store.add_group(ALICE, "日本")
    authenticate(client, "alice")

    response = await client.patch(f"/api/wallet-groups/{group_id}", json={"name": "台幣"})

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_rename_default_group_returns_400(client: AsyncClient, store: FakeStore):
    default_id = store.default_group(ALICE)
    authenticate(client, "alice")

    response = await client.patch(f"/api/wallet-groups/{default_id}", json={"name": "主要"})

    assert response.status_code == 400
    assert store.groups[default_id]["name"] is None


@pytest.mark.asyncio
async def test_another_users_group_looks_missing(client: AsyncClient, store: FakeStore):
    group_id = store.add_group(BOB, "日本")
    authenticate(client, "alice")

    renamed = await client.patch(f"/api/wallet-groups/{group_id}", json={"name": "改"})
    deleted = await client.delete(f"/api/wallet-groups/{group_id}")
    moved = await client.post(f"/api/wallet-groups/{group_id}/move", json={"direction": "up"})

    assert [renamed.status_code, deleted.status_code, moved.status_code] == [404, 404, 404]
    assert store.groups[group_id]["name"] == "日本"


@pytest.mark.asyncio
async def test_delete_group_moves_its_wallets_to_the_default_group(
    client: AsyncClient, store: FakeStore
):
    group_id = store.add_group(ALICE, "日本")
    wallet_id = store.add_wallet(members={ALICE: MemberRole.ADMIN, BOB: MemberRole.MEMBER})
    store.placement(wallet_id, ALICE)["group_id"] = group_id
    authenticate(client, "alice")

    response = await client.delete(f"/api/wallet-groups/{group_id}")

    assert response.status_code == 200
    assert group_id not in store.groups
    assert store.placement(wallet_id, ALICE)["group_id"] == store.default_group(ALICE)
    assert store.placement(wallet_id, BOB)["group_id"] == store.default_group(BOB)


@pytest.mark.asyncio
async def test_delete_default_group_returns_400(client: AsyncClient, store: FakeStore):
    default_id = store.default_group(ALICE)
    authenticate(client, "alice")

    response = await client.delete(f"/api/wallet-groups/{default_id}")

    assert response.status_code == 400
    assert default_id in store.groups


@pytest.mark.asyncio
async def test_move_group_swaps_with_the_neighbour_of_the_same_kind(
    client: AsyncClient, store: FakeStore
):
    store.add_group(ALICE, "台幣")
    japan = store.add_group(ALICE, "日圓")
    store.add_group(ALICE, "旅行", TRAVEL)
    authenticate(client, "alice")

    response = await client.post(f"/api/wallet-groups/{japan}/move", json={"direction": "up"})

    assert response.status_code == 200
    assert store.group_order(ALICE) == [None, "日圓", "台幣"]
    assert store.group_order(ALICE, TRAVEL) == [None, "旅行"]


@pytest.mark.asyncio
async def test_default_group_can_be_moved(client: AsyncClient, store: FakeStore):
    store.add_group(ALICE, "台幣")
    authenticate(client, "alice")

    await client.post(
        f"/api/wallet-groups/{store.default_group(ALICE)}/move", json={"direction": "down"}
    )

    assert store.group_order(ALICE) == ["台幣", None]


@pytest.mark.asyncio
async def test_move_group_past_the_edge_changes_nothing(client: AsyncClient, store: FakeStore):
    store.add_group(ALICE, "台幣")
    authenticate(client, "alice")

    response = await client.post(
        f"/api/wallet-groups/{store.default_group(ALICE)}/move", json={"direction": "up"}
    )

    assert response.status_code == 200
    assert store.group_order(ALICE) == [None, "台幣"]


@pytest.mark.asyncio
async def test_create_wallet_goes_to_the_default_group_and_is_shown(
    client: AsyncClient, store: FakeStore
):
    authenticate(client, "bob")

    response = await client.post("/api/wallets/", json={"kind": "general", "name": "家用"})

    placement = store.placement(response.json()["id"], BOB)
    assert placement == {"group_id": store.default_group(BOB), "is_hidden": False}


@pytest.mark.asyncio
async def test_admin_created_wallet_goes_to_the_default_group_of_the_chosen_admin(
    client: AsyncClient, store: FakeStore
):
    authenticate(client, "super")

    response = await client.post(
        "/api/admin/wallets/",
        json={"kind": "travel", "name": "東京", "destination": "日本",
              "start_date": "2026-11-01", "end_date": "2026-11-05", "admin_user_id": BOB},
    )

    placement = store.placement(response.json()["id"], BOB)
    assert placement["group_id"] == store.default_group(BOB, TRAVEL)


@pytest.mark.asyncio
async def test_list_wallets_shows_own_group_and_visibility(client: AsyncClient, store: FakeStore):
    group_id = store.add_group(ALICE, "日本")
    wallet_id = store.add_wallet()
    store.placements[(wallet_id, ALICE)] = {"group_id": group_id, "is_hidden": True}
    authenticate(client, "alice")

    wallet = (await client.get("/api/wallets/")).json()["list_data"][0]

    assert (wallet["group_id"], wallet["is_hidden"]) == (group_id, True)


@pytest.mark.asyncio
async def test_get_wallet_as_non_member_super_admin_has_no_group(
    client: AsyncClient, store: FakeStore
):
    wallet_id = store.add_wallet()
    authenticate(client, "super")

    wallet = (await client.get(f"/api/wallets/{wallet_id}")).json()

    assert (wallet["group_id"], wallet["is_hidden"]) == (None, False)


@pytest.mark.asyncio
async def test_set_wallet_group_moves_it_into_own_group_of_the_same_kind(
    client: AsyncClient, store: FakeStore
):
    group_id = store.add_group(BOB, "日本")
    wallet_id = store.add_wallet(members={ALICE: MemberRole.ADMIN, BOB: MemberRole.MEMBER})
    authenticate(client, "bob")

    response = await client.patch(f"/api/wallets/{wallet_id}/group", json={"group_id": group_id})

    assert response.status_code == 200
    assert store.placement(wallet_id, BOB)["group_id"] == group_id
    assert store.placement(wallet_id, ALICE)["group_id"] == store.default_group(ALICE)


@pytest.mark.asyncio
async def test_set_wallet_group_of_the_other_kind_returns_400(
    client: AsyncClient, store: FakeStore
):
    travel_group = store.add_group(ALICE, "旅行", TRAVEL)
    wallet_id = store.add_wallet()
    authenticate(client, "alice")

    response = await client.patch(
        f"/api/wallets/{wallet_id}/group", json={"group_id": travel_group}
    )

    assert response.status_code == 400
    assert store.placement(wallet_id, ALICE)["group_id"] == store.default_group(ALICE)


@pytest.mark.asyncio
async def test_set_wallet_group_to_another_users_group_returns_404(
    client: AsyncClient, store: FakeStore
):
    bobs_group = store.add_group(BOB, "日本")
    wallet_id = store.add_wallet()
    authenticate(client, "alice")

    response = await client.patch(f"/api/wallets/{wallet_id}/group", json={"group_id": bobs_group})

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_set_wallet_visibility_hides_it_only_for_yourself(
    client: AsyncClient, store: FakeStore
):
    wallet_id = store.add_wallet(members={ALICE: MemberRole.ADMIN, BOB: MemberRole.MEMBER})
    authenticate(client, "bob")

    response = await client.patch(f"/api/wallets/{wallet_id}/visibility", json={"is_hidden": True})

    assert response.status_code == 200
    assert store.placement(wallet_id, BOB)["is_hidden"] is True
    assert store.placement(wallet_id, ALICE)["is_hidden"] is False


@pytest.mark.asyncio
async def test_non_member_super_admin_cannot_place_or_hide_a_wallet(
    client: AsyncClient, store: FakeStore
):
    wallet_id = store.add_wallet()
    group_id = store.default_group(ALICE)
    authenticate(client, "super")

    grouped = await client.patch(f"/api/wallets/{wallet_id}/group", json={"group_id": group_id})
    hidden = await client.patch(f"/api/wallets/{wallet_id}/visibility", json={"is_hidden": True})

    assert [grouped.status_code, hidden.status_code] == [403, 403]


@pytest.mark.asyncio
async def test_place_wallet_you_have_not_joined_returns_404(client: AsyncClient, store: FakeStore):
    wallet_id = store.add_wallet()
    authenticate(client, "bob")

    response = await client.patch(f"/api/wallets/{wallet_id}/visibility", json={"is_hidden": True})

    assert response.status_code == 404
