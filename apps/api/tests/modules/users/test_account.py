"""使用者對自己帳號的操作 (`modules/users/account.py`): 註冊、登入。

改自己密碼的路徑在 `test_routes.py` (連同限流與新 token 一起驗)。這裡補的是登入本身:
路由測試為了避開 bcrypt 會把 `login_user` 整個換掉, 所以「停用的帳號不能登入」這類規則
只有在這裡才真的被執行到。
"""

import pytest
from sqlalchemy.exc import IntegrityError

from modules.roles.public import RoleTable
from modules.users import account
from modules.users.errors import UserError
from modules.users.model import UserTable
from modules.users.schema import SignupRequest, UserLogin
from shared.auth import passwords
from shared.auth.tokens import parse_token
from shared.http.errors import LangException
from tests.shared.minimal_app import MinimalEnv

ENV = MinimalEnv()
PASSWORD = "correct-password"
# 真的算一次 bcrypt, 讓比對走的是真正的雜湊; 只在 module 層算這一次。
PASSWORD_HASH = passwords.hash_password(PASSWORD)


@pytest.fixture
def stored_user(monkeypatch: pytest.MonkeyPatch):
    """`viewer` 這個帳號的資料; 回傳 dict 讓各測試改欄位 (例如停用)。"""
    user = {
        "id": "user-1",
        "username": "viewer",
        "auth_version": 3,
        "permissions": [],
        "is_disabled": False,
        "password": PASSWORD_HASH,
    }

    async def fake_find(username, include_password=False, session=None):
        return user if username == "viewer" else None

    monkeypatch.setattr(UserTable, "find_detail_by_username", fake_find)
    return user


async def _expect_invalid_credentials(username: str, password: str) -> None:
    with pytest.raises(LangException) as exc_info:
        await account.login_user(UserLogin(username=username, password=password), ENV)
    assert exc_info.value.status_code == 401
    # 三種失敗回同一個訊息: 分開說的話, 錯誤訊息本身就能拿來窮舉帳號。
    assert exc_info.value.detail == UserError.INVALID_CREDENTIALS.value.zh


@pytest.mark.asyncio
async def test_login_with_correct_password_returns_a_token_for_that_user(stored_user):
    token = await account.login_user(UserLogin(username="viewer", password=PASSWORD), ENV)

    payload = parse_token(token.access_token, ENV)
    assert payload["username"] == "viewer"
    # token 帶的世代要是資料庫裡的那一個, 否則換過密碼的人一登入就被當成舊憑證。
    assert payload["auth_version"] == 3


@pytest.mark.asyncio
async def test_login_with_wrong_password_is_rejected(stored_user):
    await _expect_invalid_credentials("viewer", "wrong-password")


@pytest.mark.asyncio
async def test_login_to_disabled_account_is_rejected_even_with_correct_password(stored_user):
    stored_user["is_disabled"] = True

    await _expect_invalid_credentials("viewer", PASSWORD)


@pytest.mark.asyncio
async def test_login_to_unknown_account_still_runs_the_password_check(
    stored_user, monkeypatch: pytest.MonkeyPatch
):
    """帳號不存在時也要走完一次比對, 這裡確認有呼叫到。

    時間差防護本身 (比對 dummy hash) 在 `shared/auth/passwords.py`, 那裡另有測試。
    """
    checked: list[str | None] = []
    real_check = passwords.verify_login_password

    async def recording_check(plain_password: str, hashed_password: str | None) -> bool:
        checked.append(hashed_password)
        return await real_check(plain_password, hashed_password)

    monkeypatch.setattr(passwords, "verify_login_password", recording_check)

    await _expect_invalid_credentials("nobody", PASSWORD)
    assert checked == [None]


# ── 公開註冊 ─────────────────────────────────────────────────────────────────

USER_ROLE_ID = "role-user"


@pytest.fixture
def signup_writes(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    """沒有既有帳號; 回傳 `UserTable.create` 收到的資料。"""
    writes: list[dict] = []

    async def no_user(username, include_password=False, session=None):
        return None

    async def user_role_id():
        return USER_ROLE_ID

    async def fake_create(data, session=None):
        writes.append(data)
        return {"id": "user-new", "auth_version": 1}

    async def fast_hash(password):
        return f"hashed:{password}"

    monkeypatch.setattr(UserTable, "find_detail_by_username", no_user)
    monkeypatch.setattr(RoleTable, "get_user_role_id", user_role_id)
    monkeypatch.setattr(UserTable, "create", fake_create)
    monkeypatch.setattr(passwords, "hash_password_async", fast_hash)
    return writes


def _signup(username: str = "newbie"):
    return account.signup_user(
        SignupRequest(username=username, password="new-password", nickname="Newbie"), ENV
    )


@pytest.mark.asyncio
async def test_signup_creates_user_bound_to_user_role(signup_writes):
    await _signup()

    assert signup_writes == [
        {
            "username": "newbie",
            "nickname": "Newbie",
            "password": "hashed:new-password",
            "role_ids": [USER_ROLE_ID],
        }
    ]


@pytest.mark.asyncio
async def test_signup_returns_a_token_for_the_new_user(signup_writes):
    """註冊完直接是登入狀態: token 對應新帳號與它的世代。"""
    token = await _signup()

    payload = parse_token(token.access_token, ENV)
    assert payload["username"] == "newbie"
    assert payload["auth_version"] == 1


def test_signup_request_cannot_choose_roles():
    """公開端點不能讓請求決定角色: 多送的 `role_ids` 在驗證時就被丟掉。"""
    form = SignupRequest.model_validate(
        {"username": "a", "password": "new-password", "nickname": "A", "role_ids": ["x"]}
    )

    assert "role_ids" not in form.model_dump()


@pytest.mark.asyncio
async def test_signup_with_existing_username_returns_409(signup_writes, stored_user):
    with pytest.raises(LangException) as exc_info:
        await _signup("viewer")

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == UserError.USERNAME_EXISTS.value.zh
    assert signup_writes == []


@pytest.mark.asyncio
async def test_signup_racing_on_username_returns_409(signup_writes, monkeypatch):
    """查過沒有之後、寫入之前被搶先註冊: 唯一約束擋下來, 回 409 而不是 500。"""

    class _UniqueViolationError(Exception):
        sqlstate = "23505"

    async def racing_create(data, session=None):
        raise IntegrityError("INSERT", {}, _UniqueViolationError())

    monkeypatch.setattr(UserTable, "create", racing_create)

    with pytest.raises(LangException) as exc_info:
        await _signup()

    assert exc_info.value.status_code == 409


@pytest.mark.integration
@pytest.mark.asyncio
async def test_signed_up_user_has_user_role_and_can_log_in(db):
    """接上真的 seed 與資料庫: 綁到的是 seed 出來的一般用戶, 而且拿註冊的密碼登得進去。"""
    token = await _signup()

    current = await UserTable.find_detail_by_username("newbie")
    assert current is not None
    detail = await UserTable.find_detail_by_id(current["id"])
    assert detail is not None
    assert detail["role_ids"] == [await RoleTable.get_user_role_id()]
    assert detail["permissions"] == []
    assert parse_token(token.access_token, ENV)["auth_version"] == current["auth_version"]

    login = await account.login_user(UserLogin(username="newbie", password="new-password"), ENV)
    assert parse_token(login.access_token, ENV)["username"] == "newbie"

