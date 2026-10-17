"""wallets 的查詢對真的 PostgreSQL: Detail 形狀、成員 join、cascade 與部分唯一索引。

單元測試 (`conftest.py` 的 FakeStore) 把這些方法整個換掉, 所以它們的 SQL 只有這裡驗。
"""

from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError

from modules.users.model import UserTable
from modules.wallets.model import (
    CategoryDetail,
    CategoryType,
    MemberRole,
    WalletCategoryTable,
    WalletDetail,
    WalletKind,
    WalletMemberTable,
    WalletTable,
)
from shared.db.transaction import transaction
from shared.time import utc_now

from ..helpers import assert_covers

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


async def _user(username: str) -> str:
    created = await UserTable.create(
        data={"username": username, "password": "hashed", "nickname": username.title()}
    )
    return created["id"]


async def _wallet(members: dict[str, MemberRole] | None = None, name: str = "家用") -> str:
    created = await WalletTable.create(data={"kind": "general", "name": name})
    for user_id, role in (members or {}).items():
        await WalletMemberTable.create(
            data={"wallet_id": created["id"], "user_id": user_id, "role": role}
        )
    return created["id"]


async def test_wallet_detail_matches_find_detail_by_id(db):
    wallet_id = await _wallet()

    result = await WalletTable.find_detail_by_id(wallet_id)

    assert result is not None
    assert_covers(WalletDetail, result, "WalletDetail")


async def test_find_joined_returns_only_wallets_of_the_user_with_role(db):
    alice, bob = await _user("alice"), await _user("bob")
    shared = await _wallet({alice: MemberRole.MEMBER, bob: MemberRole.ADMIN}, "共用")
    await _wallet({bob: MemberRole.ADMIN}, "別人的")

    joined = await WalletTable.find_joined(alice)

    assert [(item["wallet"]["id"], item["role"]) for item in joined] == [
        (shared, MemberRole.MEMBER)
    ]
    assert_covers(WalletDetail, joined[0]["wallet"], "WalletDetail")


async def test_member_role_queries(db):
    alice, bob = await _user("alice"), await _user("bob")
    wallet_id = await _wallet({alice: MemberRole.ADMIN, bob: MemberRole.MEMBER})

    await WalletTable.lock_by_id(wallet_id)
    await WalletMemberTable.set_role(wallet_id, bob, MemberRole.ADMIN)
    assert await WalletMemberTable.count_admins(wallet_id) == 2
    await WalletMemberTable.remove(wallet_id, alice)

    assert await WalletMemberTable.find_role(wallet_id, alice) is None
    assert await WalletMemberTable.list_members(wallet_id) == [
        {"user_id": bob, "role": MemberRole.ADMIN}
    ]


async def test_member_is_unique_per_wallet(db):
    alice = await _user("alice")
    wallet_id = await _wallet({alice: MemberRole.ADMIN})

    with pytest.raises(IntegrityError):
        async with transaction():
            await WalletMemberTable.create(
                data={"wallet_id": wallet_id, "user_id": alice, "role": MemberRole.MEMBER}
            )


async def test_delete_wallet_removes_members_and_categories(db):
    alice = await _user("alice")
    wallet_id = await _wallet({alice: MemberRole.ADMIN})
    await WalletCategoryTable.create_many(wallet_id, [(CategoryType.EXPENSE, "餐飲")])

    assert await WalletTable.delete_by_id(wallet_id) is True

    assert await WalletTable.find_detail_by_id(wallet_id) is None
    assert await WalletMemberTable.list_members(wallet_id) == []
    assert await WalletCategoryTable.get_all() == {"list_data": [], "count": 0}
    assert await WalletTable.delete_by_id(wallet_id) is False


async def test_list_active_keeps_creation_order_and_skips_archived(db):
    wallet_id = await _wallet()
    names = ["餐飲", "交通", "購物", "居家", "娛樂", "醫療", "其他"]
    await WalletCategoryTable.create_many(
        wallet_id, [(CategoryType.EXPENSE, name) for name in names]
    )
    categories = await WalletCategoryTable.list_active(wallet_id)
    await WalletCategoryTable.update_by_id(categories[0]["id"], {"archived_at": utc_now()})

    remaining = await WalletCategoryTable.list_active(wallet_id)

    assert [category["name"] for category in remaining] == names[1:]
    assert_covers(CategoryDetail, remaining[0], "CategoryDetail")
    assert await WalletCategoryTable.find_detail_active(wallet_id, categories[0]["id"]) is None


async def test_category_unique_constraint_rejects_duplicate_name(db):
    """service 會先查一次; 這個索引擋的是兩個請求同時新增。"""
    wallet_id = await _wallet()
    await WalletCategoryTable.create_many(wallet_id, [(CategoryType.EXPENSE, "餐飲")])

    with pytest.raises(IntegrityError):
        async with transaction():
            await WalletCategoryTable.create(
                data={"wallet_id": wallet_id, "type": CategoryType.EXPENSE, "name": "餐飲"}
            )


async def test_category_unique_constraint_ignores_archived_and_other_type(db):
    wallet_id = await _wallet()
    await WalletCategoryTable.create_many(wallet_id, [(CategoryType.EXPENSE, "其他")])
    archived = (await WalletCategoryTable.list_active(wallet_id))[0]
    await WalletCategoryTable.update_by_id(archived["id"], {"archived_at": utc_now()})

    await WalletCategoryTable.create_many(
        wallet_id, [(CategoryType.EXPENSE, "其他"), (CategoryType.INCOME, "其他")]
    )

    active = await WalletCategoryTable.list_active(wallet_id)
    expense = next(c for c in active if c["type"] == CategoryType.EXPENSE)
    assert len(active) == 2
    # 排除掉自己之後, 封存的那一筆不算撞名。
    assert not await WalletCategoryTable.name_taken(
        wallet_id, CategoryType.EXPENSE, "其他", exclude_id=expense["id"]
    )


async def test_travel_wallet_end_before_start_is_rejected_by_the_database(db):
    with pytest.raises(IntegrityError):
        async with transaction():
            await WalletTable.create(
                data={
                    "kind": "travel",
                    "name": "東京",
                    "destination": "日本",
                    "start_date": date(2026, 11, 5),
                    "end_date": date(2026, 11, 1),
                }
            )


async def test_find_page_filters_by_name_and_kind(db):
    await _wallet(name="家用")
    await _wallet(name="家族旅費")
    await WalletTable.create(
        data={
            "kind": "travel",
            "name": "家族旅行",
            "destination": "東京",
            "start_date": date(2026, 11, 1),
            "end_date": date(2026, 11, 5),
        }
    )

    by_name = await WalletTable.find_page(limit=10, name="旅")
    by_kind = await WalletTable.find_page(limit=10, kind=WalletKind.TRAVEL)
    both = await WalletTable.find_page(limit=10, name="家", kind=WalletKind.GENERAL)

    assert [item["name"] for item in by_name["list_data"]] == ["家族旅費", "家族旅行"]
    assert [item["name"] for item in by_kind["list_data"]] == ["家族旅行"]
    assert [item["name"] for item in both["list_data"]] == ["家用", "家族旅費"]
    assert both["total_count"] == 2


async def test_find_page_paginates_all_wallets(db):
    for index in range(3):
        await _wallet(name=f"錢包{index}")

    first = await WalletTable.find_page(limit=2)
    second = await WalletTable.find_page(limit=2, cursor=first["next_cursor"])

    assert [item["name"] for item in first["list_data"]] == ["錢包0", "錢包1"]
    assert [item["name"] for item in second["list_data"]] == ["錢包2"]
    assert first["total_count"] == 3
    assert_covers(WalletDetail, first["list_data"][0], "WalletTable.find_page")


async def test_list_by_wallets_groups_members_per_wallet(db):
    alice, bob = await _user("alice"), await _user("bob")
    shared = await _wallet({alice: MemberRole.ADMIN, bob: MemberRole.MEMBER})
    empty = await _wallet()

    result = await WalletMemberTable.list_by_wallets([shared, empty, "not-a-uuid"])

    assert result == {
        shared: [
            {"user_id": alice, "role": MemberRole.ADMIN},
            {"user_id": bob, "role": MemberRole.MEMBER},
        ],
        empty: [],
        "not-a-uuid": [],
    }
