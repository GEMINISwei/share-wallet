"""建立超級管理者 (見 `modules/users/bootstrap.py`): 只有 CLI 這一條路徑。

CLI 的測試標 `integration`: 要真的角色 seed、外鍵與唯一約束, 所以需要 PostgreSQL。
"""

import pytest
from sqlalchemy import func, select

from modules.roles.model import RoleTable
from modules.users import bootstrap
from modules.users.errors import UserError
from modules.users.model import UserTable
from modules.users.schema import SuperAdminCreate
from shared.db.session import resolve_session
from shared.http.errors import LangException


def _super_admin_form(username: str = "rescue") -> SuperAdminCreate:
    return SuperAdminCreate(username=username, password="sup3r-secret", nickname="Rescue")


async def _user_count() -> int:
    return await resolve_session(None).scalar(select(func.count()).select_from(UserTable)) or 0


@pytest.mark.integration
@pytest.mark.asyncio
async def test_cli_create_super_admin_assigns_super_admin_role(db):
    created = await bootstrap.create_super_admin(form_data=_super_admin_form())

    detail = await UserTable.find_detail_by_id(created.id)
    assert detail is not None
    assert detail["username"] == "rescue"
    assert detail["role_ids"] == [await RoleTable.get_super_admin_role_id()]
    assert detail["permissions"] == ["*"]

    row = await UserTable.find_by_id(created.id)
    assert row is not None
    # 少了它, 第一次重設密碼的 +1 會從缺值開始。
    assert row.auth_version == 1


@pytest.mark.integration
@pytest.mark.asyncio
async def test_cli_create_super_admin_allows_a_second_one(db):
    """沒有「只能一次」的限制: 救援失聯的超管、或需要第二位時都靠它。"""
    await bootstrap.create_super_admin(form_data=_super_admin_form("first"))
    await bootstrap.create_super_admin(form_data=_super_admin_form("second"))

    assert await _user_count() == 2


@pytest.mark.integration
@pytest.mark.asyncio
async def test_cli_create_super_admin_rejects_duplicate_username(db):
    await bootstrap.create_super_admin(form_data=_super_admin_form())

    with pytest.raises(LangException) as exc_info:
        await bootstrap.create_super_admin(form_data=_super_admin_form())

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == UserError.USERNAME_EXISTS.value.zh
    assert await _user_count() == 1


def test_create_super_admin_is_not_exposed_over_http():
    """這條路徑繞過 `validate_role_ids`, 授權模型是「呼叫者握有伺服器 shell」。

    一旦有人把它接上 router, 授權模型就悄悄換成了「某個 permission」或「誰先進站」——
    那是完全不同的一件事, 而且從 diff 上看起來只是「多了一個端點」。
    """
    from app.server import app

    for route in app.routes:
        endpoint = getattr(route, "endpoint", None)
        assert endpoint is not bootstrap.create_super_admin
        assert "create_super_admin" not in getattr(endpoint, "__name__", "")
