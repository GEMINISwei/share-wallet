"""roles 宣告的 `RoleDetail`, 必須與兩個 finder 實際吐出來的欄位相符。

理由見 `tests/modules/users/test_model.py`: `cast` 不做執行期檢查, 只有連上真的資料庫跑
查詢才驗得到。標成 integration, 本機沒有資料庫會自動 skip, CI 上會真的跑。
"""

import pytest

from modules.roles.model import USER_ROLE_CODE, RoleDetail, RoleTable
from shared.db.table import PagedResult, SimpleListResult

from ..helpers import assert_covers

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


async def test_role_detail_matches_both_finders(db):
    created = await RoleTable.create(data={"name": "契約角色", "permissions": []})

    by_id = await RoleTable.find_detail_by_id(created["id"])
    by_ids = await RoleTable.find_details_by_ids([created["id"]])

    assert by_id is not None
    assert_covers(RoleDetail, by_id, "RoleDetail（find_detail_by_id）")
    assert len(by_ids) == 1
    assert_covers(RoleDetail, by_ids[0], "RoleDetail（find_details_by_ids）")


async def test_seed_creates_user_role_with_no_permissions(db):
    await RoleTable.ensure_seed()

    role = await RoleTable.find_detail_by_code(USER_ROLE_CODE)

    assert role is not None
    assert role["permissions"] == []
    assert role["is_disabled"] is False


async def test_reseed_keeps_user_role_permissions_set_by_admin(db):
    """超管調整過的權限, 下次部署 (再跑一次 seed) 之後還在。"""
    await RoleTable.ensure_seed()
    role_id = await RoleTable.get_user_role_id()
    # 直接寫入任意字串: 目前的 `Permission` 除了 `*` 之外沒有別的值, 而這裡驗的是 seed 不覆蓋。
    await RoleTable.update_by_id(id=role_id, data={"permissions": ["wallets:read"]})

    await RoleTable.ensure_seed()

    role = await RoleTable.find_detail_by_code(USER_ROLE_CODE)
    assert role is not None
    assert role["permissions"] == ["wallets:read"]


def _names(result: PagedResult | SimpleListResult) -> list[str]:
    return sorted(role["name"] for role in result["list_data"])


async def test_find_list_filters_by_name_and_disabled_status(db):
    await RoleTable.create(data={"name": "編輯者", "permissions": []})
    await RoleTable.create(data={"name": "檢視者", "permissions": []})
    await RoleTable.create(data={"name": "舊編輯", "permissions": [], "is_disabled": True})

    assert _names(await RoleTable.find_list(limit=20, name="編輯")) == ["編輯者", "舊編輯"]
    assert _names(await RoleTable.find_list(limit=20, is_disabled=True)) == ["舊編輯"]
    assert _names(await RoleTable.find_list(limit=20, name="編輯", is_disabled=False)) == ["編輯者"]


async def test_find_options_filters_by_disabled_status(db):
    """下拉選單通常只要啟用中的角色; 不帶條件時列全部。"""
    await RoleTable.create(data={"name": "啟用", "permissions": []})
    await RoleTable.create(data={"name": "停用", "permissions": [], "is_disabled": True})

    assert _names(await RoleTable.find_options(is_disabled=False)) == ["啟用"]
    assert _names(await RoleTable.find_options()) == ["停用", "啟用"]


async def test_get_system_role_id_seeds_when_missing(db):
    """系統角色被誤刪或還沒 seed 時自己補回來, 而不是讓建立超管的指令失敗。"""
    assert await RoleTable.find_detail_by_code("super_admin") is None

    role_id = await RoleTable.get_super_admin_role_id()

    seeded = await RoleTable.find_detail_by_code("super_admin")
    assert seeded is not None
    assert seeded["id"] == role_id
    assert await RoleTable.get_super_admin_role_id() == role_id
