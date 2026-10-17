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

from .model import CategoryType, MemberRole, WalletKind

# JavaScript 數字能精確表示的整數上限。資料庫是 BIGINT, 但超過這個值送到瀏覽器就會失真,
# 而且不會有任何錯誤。
MAX_SAFE_AMOUNT = 2**53 - 1

Amount = Annotated[int, Field(ge=-MAX_SAFE_AMOUNT, le=MAX_SAFE_AMOUNT)]
WalletName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
Destination = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
CategoryName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)
]


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
