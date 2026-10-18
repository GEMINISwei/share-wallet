"""錢包的請求與回應形狀。

錢包的建立與修改用 `kind` 區分的 discriminated union: 兩種錢包的欄位不同, 分成兩個
model 才能讓「旅遊錢包一定有目的地與起訖日、一般錢包一定沒有」由驗證擋下, 而不是
在 service 裡逐欄判斷。OpenAPI 也因此標得出兩種形狀, 前端拿到的是聯集型別。
"""

from datetime import date
from typing import Annotated, Literal, Self

from pydantic import BaseModel, Field, StringConstraints, model_validator

from shared.http.errors import BaseError, LangText, resolve_text
from shared.http.schema import PaginatedResponse, SimpleListResponse, UtcDateTime
from shared.http.schema import UuidText as UuidText

from .model import CategoryType, EntryKind, EntryLogAction, MemberRole, WalletKind

# JavaScript 數字能精確表示的整數上限。資料庫是 BIGINT, 但超過這個值送到瀏覽器就會失真,
# 而且不會有任何錯誤。
MAX_SAFE_AMOUNT = 2**53 - 1

Amount = Annotated[int, Field(ge=-MAX_SAFE_AMOUNT, le=MAX_SAFE_AMOUNT)]
PositiveAmount = Annotated[int, Field(gt=0, le=MAX_SAFE_AMOUNT)]
EntryNote = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
WalletName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
Destination = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
CategoryName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]


class WalletSchemaError(BaseError):
    END_BEFORE_START = LangText(
        zh="結束日不可早於開始日", en="End date cannot be before start date"
    )


class _TravelFields(BaseModel):
    destination: Destination
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def _end_not_before_start(self) -> Self:
        # 必須丟 ValueError 才會轉成 422, 理由同 shared/http/schema.py 的 validate_uuid。
        if self.end_date < self.start_date:
            raise ValueError(resolve_text(WalletSchemaError.END_BEFORE_START.value))
        return self


class GeneralWalletCreate(BaseModel):
    kind: Literal[WalletKind.GENERAL]
    name: WalletName
    initial_balance: Amount = 0


class TravelWalletCreate(_TravelFields):
    kind: Literal[WalletKind.TRAVEL]
    name: WalletName


WalletCreate = Annotated[GeneralWalletCreate | TravelWalletCreate, Field(discriminator="kind")]


class AdminGeneralWalletCreate(GeneralWalletCreate):
    #: 這個錢包唯一的管理者, 必須是啟用中的使用者 (可以是超級管理者自己)。
    admin_user_id: UuidText


class AdminTravelWalletCreate(TravelWalletCreate):
    #: 這個錢包唯一的管理者, 必須是啟用中的使用者 (可以是超級管理者自己)。
    admin_user_id: UuidText


AdminWalletCreate = Annotated[
    AdminGeneralWalletCreate | AdminTravelWalletCreate, Field(discriminator="kind")
]


class GeneralWalletUpdate(BaseModel):
    kind: Literal[WalletKind.GENERAL]
    name: WalletName


class TravelWalletUpdate(_TravelFields):
    kind: Literal[WalletKind.TRAVEL]
    name: WalletName


WalletUpdate = Annotated[GeneralWalletUpdate | TravelWalletUpdate, Field(discriminator="kind")]


class WalletOperate(BaseModel):
    id: str


class WalletInfo(BaseModel):
    """一個錢包。`balance` 只有一般錢包才有。"""

    id: str
    kind: WalletKind
    name: str
    balance: int | None
    destination: str | None
    start_date: date | None
    end_date: date | None
    created_at: UtcDateTime
    #: 自己在這個錢包的角色; 沒有加入 (超級管理者從網址打開) 時是 null。
    my_role: MemberRole | None
    #: 能不能管理這個錢包 (設定、成員、分類、刪除)。
    can_manage: bool


class WalletList(SimpleListResponse["WalletInfo"]):
    """自己加入的錢包。`total_balance` 是其中所有一般錢包餘額的總和。"""

    total_balance: int


class WalletAdmin(BaseModel):
    user_id: str
    nickname: str


class AdminWalletInfo(BaseModel):
    """後台列表上的一個錢包。`balance` 只有一般錢包才有。"""

    id: str
    kind: WalletKind
    name: str
    balance: int | None
    destination: str | None
    start_date: date | None
    end_date: date | None
    created_at: UtcDateTime
    #: 成員人數, 含管理者。
    member_count: int
    #: 所有管理者, 依加入的先後排序。
    admins: list[WalletAdmin]


class AdminWalletList(PaginatedResponse["AdminWalletInfo"]):
    """所有錢包, 不論自己有沒有加入。"""


class MemberInfo(BaseModel):
    user_id: str
    nickname: str
    role: MemberRole


class MemberList(SimpleListResponse["MemberInfo"]):
    pass


class MemberRoleUpdate(BaseModel):
    role: MemberRole


class MemberOperate(BaseModel):
    user_id: str


class CategoryInfo(BaseModel):
    id: str
    type: CategoryType
    name: str


class CategoryList(SimpleListResponse["CategoryInfo"]):
    """未封存的分類, 依建立順序排列。"""


class CategoryCreate(BaseModel):
    type: CategoryType
    name: CategoryName


class CategoryRename(BaseModel):
    """分類只能改名, 類型建立後不能改。"""

    name: CategoryName


class CategoryOperate(BaseModel):
    id: str


class InviteInfo(BaseModel):
    """錢包目前有效的邀請連結。確認頁的網址由前端依 `token` 組出。"""

    token: str
    expires_at: UtcDateTime


class InviteState(BaseModel):
    """`invite` 是 null 表示沒有有效的連結 (沒產生過、已撤銷或已過期)。"""

    invite: InviteInfo | None


class InvitePreview(BaseModel):
    """邀請連結的確認頁要顯示的錢包摘要。"""

    wallet_id: str
    kind: WalletKind
    name: str
    destination: str | None
    start_date: date | None
    end_date: date | None
    #: 成員人數, 含管理者。
    member_count: int
    #: 自己是不是已經是這個錢包的成員。
    is_member: bool


class EntryCreate(BaseModel):
    """記一筆收入或支出。分類的類型要與 `kind` 相同。"""

    kind: Literal[EntryKind.INCOME, EntryKind.EXPENSE]
    amount: PositiveAmount
    category_id: UuidText
    entry_date: date
    note: EntryNote = ""


class EntryUpdate(EntryCreate):
    """修改收入或支出, 可以在兩者之間切換。分類被封存後仍可保留原本的分類。調整不能修改。"""


class BalanceAdjust(BaseModel):
    """調整餘額: 輸入實際餘額, 記下一筆與目前餘額的差額。"""

    balance: Amount
    entry_date: date
    note: EntryNote = ""


class EntryOperate(BaseModel):
    id: str


class EntryUser(BaseModel):
    user_id: str
    nickname: str


class EntryCategory(BaseModel):
    id: str
    #: 分類目前的名稱, 含已封存的分類。
    name: str


class EntryInfo(BaseModel):
    """一筆帳。收入與支出的 `amount` 是正數; 調整的 `amount` 是差額, 可以是負的。"""

    id: str
    kind: EntryKind
    amount: int
    #: 調整沒有分類。
    category: EntryCategory | None
    entry_date: date
    note: str
    created_by: EntryUser
    created_at: UtcDateTime


class EntryPage(BaseModel):
    """帳目的一頁, 日期新到舊。`next_cursor` 是 null 表示沒有更多了。"""

    list_data: list[EntryInfo]
    next_cursor: str | None


class EntrySnapshot(BaseModel):
    """異動當時的帳目內容。`category_name` 是當時的分類名稱。"""

    kind: EntryKind
    amount: int
    category_name: str | None
    entry_date: date
    note: str


class EntryLogInfo(BaseModel):
    """一筆異動紀錄。新增沒有 `before`, 刪除沒有 `after`。"""

    id: str
    entry_id: str
    action: EntryLogAction
    actor: EntryUser
    #: 這次操作是靠超級管理者的身分才做得到的 (不是成員, 或改刪別人的帳而不是錢包管理者)。
    as_super_admin: bool
    before: EntrySnapshot | None
    after: EntrySnapshot | None
    created_at: UtcDateTime


class EntryLogList(SimpleListResponse["EntryLogInfo"]):
    """一筆帳的異動紀錄, 新到舊。"""


class EntryLogPage(BaseModel):
    """整個錢包的異動紀錄的一頁, 新到舊, 包含已刪除的帳。"""

    list_data: list[EntryLogInfo]
    next_cursor: str | None
