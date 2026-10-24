"""只給 CLI 用的帳號操作: 建立超級管理者 (`make db superuser`) 與全員登出
(`make db revoke-sessions`)。兩者的授權模型相同: 呼叫者已經有伺服器的 shell 存取權,
所以都不接在任何 router 上。

這是**僅有的**能產生超級管理者的路徑 (一般的建立使用者永遠不行, 見
`service.validate_role_ids`; 公開註冊固定綁一般用戶, 見 `account.signup_user`), 所以和一般的
使用者管理分開放, 一眼看得出邊界。

網頁上刻意沒有「建立第一位超管」的畫面: 那種畫面在部署之後、有人完成初始化之前是公開的,
誰先進站誰就拿到全部權限。
"""

from sqlalchemy.exc import IntegrityError

from modules.roles.public import RoleTable
from shared.auth import passwords
from shared.db.table import is_unique_violation
from shared.http.errors import LangException

from .errors import UserError
from .model import UserTable
from .schema import SessionRevocation, SuperAdminCreate, UserOperate


async def create_super_admin(form_data: SuperAdminCreate) -> UserOperate:
    """由 CLI 建立超級管理者, 可以重複執行 (救援失聯的超管、或需要第二位時)。

    **刻意不接在任何 router 上, 也不應該接。** 它是唯一繞過 `validate_role_ids` 的路徑,
    授權模型是「呼叫者已經有伺服器的 shell 存取權」; 接上 HTTP 就變成完全不同的授權模型。
    """
    if await UserTable.find_detail_by_username(username=form_data.username):
        raise LangException(409, UserError.USERNAME_EXISTS)

    role_ids = [await RoleTable.get_super_admin_role_id()]
    password_hash = await passwords.hash_password_async(form_data.password)

    try:
        return UserOperate.model_validate(
            await UserTable.create(
                data={
                    "username": form_data.username,
                    "nickname": form_data.nickname,
                    "password": password_hash,
                    "role_ids": role_ids,
                }
            )
        )
    except IntegrityError as exc:
        if not is_unique_violation(exc):
            raise
        # CLI 序列執行, 只可能撞到 username。
        raise LangException(409, UserError.USERNAME_EXISTS) from exc


async def revoke_all_sessions() -> SessionRevocation:
    """讓所有使用者都要重新登入 (帳號被盜、懷疑 token 外流時)。

    `JWT_SECRET_KEY` 本身外洩時這不夠: 拿到金鑰的人能自己簽新世代的 token, 那時要換金鑰。
    """
    return SessionRevocation(affected=await UserTable.revoke_all_sessions())
