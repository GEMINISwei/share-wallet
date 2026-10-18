"""wallets 的查詢對真的 PostgreSQL: Detail 形狀、成員 join、cascade 與部分唯一索引。

單元測試 (`conftest.py` 的 FakeStore) 把這些方法整個換掉, 所以它們的 SQL 只有這裡驗。
"""

import asyncio
from datetime import date, timedelta

import pytest
from sqlalchemy.exc import IntegrityError

from modules.users.model import UserTable
from modules.wallets.model import (
    CategoryDetail,
    CategoryType,
    EntryDetail,
    EntryKind,
    EntryLogAction,
    EntryLogDetail,
    MemberRole,
    WalletCategoryTable,
    WalletDetail,
    WalletEntryLogTable,
    WalletEntryTable,
    WalletInviteTable,
    WalletKind,
    WalletMemberTable,
    WalletTable,
)
from shared.db.session import session_scope
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


async def test_replace_invite_keeps_one_row_per_wallet(db):
    wallet_id = await _wallet()
    expires = utc_now() + timedelta(days=1)

    await WalletInviteTable.replace(wallet_id, "old-token", expires)
    await WalletInviteTable.replace(wallet_id, "new-token", expires)

    assert await WalletInviteTable.find_detail_by_token("old-token") is None
    assert await WalletInviteTable.find_detail_by_wallet(wallet_id) == {
        "wallet_id": wallet_id,
        "token": "new-token",
        "expires_at": expires,
    }


async def test_delete_wallet_cascades_invite(db):
    wallet_id = await _wallet()
    await WalletInviteTable.replace(wallet_id, "token", utc_now() + timedelta(days=1))

    await WalletTable.delete_by_id(wallet_id)

    assert await WalletInviteTable.find_detail_by_token("token") is None


async def test_add_member_if_absent_ignores_existing(db):
    alice, bob = await _user("alice"), await _user("bob")
    wallet_id = await _wallet({alice: MemberRole.ADMIN})

    await WalletMemberTable.add_if_absent(wallet_id, alice, MemberRole.MEMBER)
    await WalletMemberTable.add_if_absent(wallet_id, bob, MemberRole.MEMBER)
    await WalletMemberTable.add_if_absent(wallet_id, bob, MemberRole.MEMBER)

    assert await WalletMemberTable.list_members(wallet_id) == [
        {"user_id": alice, "role": MemberRole.ADMIN},
        {"user_id": bob, "role": MemberRole.MEMBER},
    ]


async def _category(wallet_id: str, name: str = "餐飲") -> str:
    await WalletCategoryTable.create_many(wallet_id, [(CategoryType.EXPENSE, name)])
    [category] = [c for c in await WalletCategoryTable.list_active(wallet_id) if c["name"] == name]
    return category["id"]


async def _entry(wallet_id: str, user_id: str, category_id: str, day: date, amount: int = 100):
    created = await WalletEntryTable.create(
        data={
            "wallet_id": wallet_id,
            "kind": EntryKind.EXPENSE,
            "amount": amount,
            "category_id": category_id,
            "entry_date": day,
            "created_by": user_id,
        }
    )
    return created["id"]


async def test_find_entry_page_orders_by_date_then_created_at(db):
    alice = await _user("alice")
    wallet_id = await _wallet({alice: MemberRole.ADMIN})
    food = await _category(wallet_id)
    older = await _entry(wallet_id, alice, food, date(2026, 10, 1))
    first_today = await _entry(wallet_id, alice, food, date(2026, 10, 18))
    second_today = await _entry(wallet_id, alice, food, date(2026, 10, 18))
    future = await _entry(wallet_id, alice, food, date(2026, 12, 25))

    page = await WalletEntryTable.find_page(wallet_id, limit=10)

    assert [entry["id"] for entry in page["list_data"]] == [
        future,
        second_today,
        first_today,
        older,
    ]
    assert page["next_cursor"] is None
    assert page["list_data"][0]["category_name"] == "餐飲"
    assert_covers(EntryDetail, page["list_data"][0], "EntryDetail")


async def test_find_entry_page_paginates_with_cursor(db):
    alice = await _user("alice")
    wallet_id = await _wallet({alice: MemberRole.ADMIN})
    other = await _wallet({alice: MemberRole.ADMIN}, "別的")
    food = await _category(wallet_id)
    ids = [await _entry(wallet_id, alice, food, date(2026, 10, day)) for day in range(1, 6)]
    await _entry(other, alice, await _category(other), date(2026, 10, 3))

    first = await WalletEntryTable.find_page(wallet_id, limit=2)
    second = await WalletEntryTable.find_page(wallet_id, limit=2, cursor=first["next_cursor"])
    last = await WalletEntryTable.find_page(wallet_id, limit=2, cursor=second["next_cursor"])

    pages = [first, second, last]
    assert [[e["id"] for e in page["list_data"]] for page in pages] == [
        ids[4:2:-1],
        ids[2:0:-1],
        ids[:1],
    ]
    assert last["next_cursor"] is None


async def test_entry_amount_check_rejects_zero_income(db):
    alice = await _user("alice")
    wallet_id = await _wallet({alice: MemberRole.ADMIN})
    food = await _category(wallet_id)

    with pytest.raises(IntegrityError):
        async with transaction():
            await _entry(wallet_id, alice, food, date(2026, 10, 18), amount=0)
    with pytest.raises(IntegrityError):
        async with transaction():
            # 調整一定沒有分類。
            await WalletEntryTable.create(
                data={
                    "wallet_id": wallet_id,
                    "kind": EntryKind.ADJUSTMENT,
                    "amount": -10,
                    "category_id": food,
                    "entry_date": date(2026, 10, 18),
                    "created_by": alice,
                }
            )


async def _log(wallet_id: str, entry_id: str, user_id: str, action: EntryLogAction) -> None:
    await WalletEntryLogTable.create(
        data={
            "wallet_id": wallet_id,
            "entry_id": entry_id,
            "action": action,
            "actor_id": user_id,
            "before": None,
            "after": {"amount": 100},
        }
    )


async def test_delete_wallet_cascades_entries_and_logs(db):
    alice = await _user("alice")
    wallet_id = await _wallet({alice: MemberRole.ADMIN})
    entry_id = await _entry(wallet_id, alice, await _category(wallet_id), date(2026, 10, 18))
    await _log(wallet_id, entry_id, alice, EntryLogAction.CREATE)

    assert await WalletTable.delete_by_id(wallet_id) is True

    assert await WalletEntryTable.get_all() == {"list_data": [], "count": 0}
    assert await WalletEntryLogTable.get_all() == {"list_data": [], "count": 0}


async def test_entry_logs_survive_entry_deletion(db):
    alice = await _user("alice")
    wallet_id = await _wallet({alice: MemberRole.ADMIN})
    entry_id = await _entry(wallet_id, alice, await _category(wallet_id), date(2026, 10, 18))
    await _log(wallet_id, entry_id, alice, EntryLogAction.CREATE)
    await _log(wallet_id, entry_id, alice, EntryLogAction.DELETE)

    await WalletEntryTable.delete_in_wallet(wallet_id, entry_id)

    logs = await WalletEntryLogTable.list_for_entry(wallet_id, entry_id)
    assert [log["action"] for log in logs] == [EntryLogAction.DELETE, EntryLogAction.CREATE]
    assert_covers(EntryLogDetail, logs[0], "EntryLogDetail")
    page = await WalletEntryLogTable.find_page(wallet_id, limit=1)
    rest = await WalletEntryLogTable.find_page(wallet_id, limit=1, cursor=page["next_cursor"])
    assert [log["id"] for log in page["list_data"] + rest["list_data"]] == [
        log["id"] for log in logs
    ]
    assert rest["next_cursor"] is None
    assert await WalletEntryTable.find_detail_in_wallet(wallet_id, entry_id) is None


async def test_concurrent_balance_changes_are_serialized(db):
    """兩個交易同時「鎖、讀餘額、寫回」, 後到的要等前一個 commit 才讀得到餘額。

    這是 `lock_balance` 用 `FOR UPDATE` 的理由: 不鎖的話兩邊都讀到 0、都寫回 100,
    其中一筆記帳就消失了。
    """
    async with session_scope():
        wallet_id = await _wallet()

    async def add_hundred() -> None:
        async with session_scope():
            balance = await WalletTable.lock_balance(wallet_id)
            assert balance is not None
            # 讓出控制權, 另一個交易在這時候嘗試讀餘額。
            await asyncio.sleep(0.05)
            await WalletTable.set_balance(wallet_id, balance + 100)

    await asyncio.gather(add_hundred(), add_hundred())

    async with session_scope():
        assert await WalletTable.lock_balance(wallet_id) == 200
