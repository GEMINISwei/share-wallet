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

from .model import (
    CategoryType,
    EntryKind,
    EntryLogAction,
    MemberRole,
    SplitMode,
    WalletKind,
    WalletStatus,
)

# JavaScript 數字能精確表示的整數上限。資料庫是 BIGINT, 但超過這個值送到瀏覽器就會失真,
# 而且不會有任何錯誤。
MAX_SAFE_AMOUNT = 2**53 - 1

Amount = Annotated[int, Field(ge=-MAX_SAFE_AMOUNT, le=MAX_SAFE_AMOUNT)]
PositiveAmount = Annotated[int, Field(gt=0, le=MAX_SAFE_AMOUNT)]
EntryNote = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
WalletName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
Destination = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
CategoryName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]
TargetName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]


class WalletSchemaError(BaseError):
    END_BEFORE_START = LangText(
        zh="結束日不可早於開始日", en="End date cannot be before start date"
    )
    DUPLICATE_PARTICIPANT = LangText(
        zh="同一個人不能出現兩次", en="The same person cannot appear twice"
    )
    SHARES_NOT_SUM = LangText(
        zh="分攤金額的加總必須等於總額", en="The shares must add up to the total amount"
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
    #: 一般錢包一律是 `active`。
    status: WalletStatus
    balance: int | None
    destination: str | None
    start_date: date | None
    end_date: date | None
    created_at: UtcDateTime
    #: 自己在這個錢包的角色; 沒有加入 (超級管理者從網址打開) 時是 null。
    my_role: MemberRole | None
    #: 能不能管理這個錢包 (設定、成員、分類、刪除)。
    can_manage: bool
    #: 自己有沒有把它設為最愛; 沒有加入時是 false。
    is_favorite: bool


class FavoriteUpdate(BaseModel):
    is_favorite: bool


class WalletList(SimpleListResponse["WalletInfo"]):
    """自己加入的錢包: 最愛的在前, 其餘依加入的先後, 已結帳的一律排在最後。

    `total_balance` 是其中所有一般錢包餘額的總和。
    """

    total_balance: int


class WalletAdmin(BaseModel):
    user_id: str
    nickname: str


class AdminWalletInfo(BaseModel):
    """後台列表上的一個錢包。`balance` 只有一般錢包才有。"""

    id: str
    kind: WalletKind
    name: str
    #: 一般錢包一律是 `active`。
    status: WalletStatus
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


class TransferCreate(BaseModel):
    """記一筆轉帳: `transfer_out` 是從這個錢包轉到對方, `transfer_in` 是從對方轉進來。

    兩個錢包各記一筆, 一起建立、一起修改、一起刪除。要同時是兩個錢包的成員。
    """

    kind: Literal[EntryKind.TRANSFER_OUT, EntryKind.TRANSFER_IN]
    counterpart_wallet_id: UuidText
    amount: PositiveAmount
    entry_date: date
    note: EntryNote = ""


class TransferUpdate(BaseModel):
    """修改轉帳, 兩邊一起改。不能換對方錢包, 也不能切換轉出與轉入。"""

    amount: PositiveAmount
    entry_date: date
    note: EntryNote = ""


class AdvanceCreate(BaseModel):
    """記一筆代墊: 錢包替 `target_name` 墊付, 餘額扣掉、對象的未還金額加上。

    對象不需要是成員; 名字去掉前後空白後相同 (大小寫視為不同) 就是同一個對象。
    """

    target_name: TargetName
    amount: PositiveAmount
    entry_date: date
    note: EntryNote = ""


class MoneyUpdate(BaseModel):
    """修改代墊、新增或修改還款: 不能改對象, 也不能把還款換到另一筆代墊。"""

    amount: PositiveAmount
    entry_date: date
    note: EntryNote = ""


class AdvanceTargetInfo(BaseModel):
    name: str
    #: 這個對象各筆代墊未還金額的總和, 已還清的是 0。
    outstanding: int


class AdvanceTargetList(SimpleListResponse["AdvanceTargetInfo"]):
    """這個錢包用過的代墊對象, 依名字排序。"""


class EntryOperate(BaseModel):
    id: str


class EntryUser(BaseModel):
    user_id: str
    nickname: str


class EntryCategory(BaseModel):
    id: str
    #: 分類目前的名稱, 含已封存的分類。
    name: str


class EntryWallet(BaseModel):
    id: str
    name: str


class EntryInfo(BaseModel):
    """一筆帳。收入、支出與轉帳的 `amount` 是正數; 調整的 `amount` 是差額, 可以是負的。"""

    id: str
    kind: EntryKind
    amount: int
    #: 只有收入與支出有分類。
    category: EntryCategory | None
    #: 轉帳的對方錢包。不是轉帳時是 null; 轉帳而對方錢包已刪除時也是 null, 這筆只能刪除。
    counterpart_wallet: EntryWallet | None
    #: 代墊與還款的對象; 其他種類是 null。
    advance_target_name: str | None
    #: 還款對的那一筆代墊; 不是還款時是 null。
    advance_id: str | None
    #: 代墊還沒還的金額; 不是代墊時是 null。
    outstanding: int | None
    entry_date: date
    note: str
    created_by: EntryUser
    created_at: UtcDateTime


class RepaymentList(SimpleListResponse["EntryInfo"]):
    """一筆代墊的還款, 日期新到舊。"""


class EntryPage(BaseModel):
    """帳目的一頁, 日期新到舊。`next_cursor` 是 null 表示沒有更多了。"""

    list_data: list[EntryInfo]
    next_cursor: str | None


class EntrySnapshot(BaseModel):
    """異動當時的帳目內容。各個 `*_name` 是當時的名稱。"""

    kind: EntryKind
    amount: int
    category_name: str | None
    #: 轉帳的對方錢包; 不是轉帳, 或當時對方錢包已刪除時是 null。
    counterpart_wallet_name: str | None = None
    #: 代墊與還款的對象。
    advance_target_name: str | None = None
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


class _ExpenseFields(BaseModel):
    amount: PositiveAmount
    #: 必須是這個錢包的成員。
    payer_id: UuidText
    entry_date: date
    note: EntryNote = ""


def _ensure_unique(user_ids: list[str]) -> None:
    # 必須丟 ValueError 才會轉成 422, 理由同 `_TravelFields`。
    if len(set(user_ids)) != len(user_ids):
        raise ValueError(resolve_text(WalletSchemaError.DUPLICATE_PARTICIPANT.value))


class EqualExpenseCreate(_ExpenseFields):
    """均分: 零頭依序分給前幾人, 付款人優先, 其餘照加入錢包的順序 (見 docs/features.md〈分攤〉)。"""

    split_mode: Literal[SplitMode.EQUAL]
    #: 分攤對象, 都必須是這個錢包的成員。順序不影響結果。
    participant_ids: list[UuidText] = Field(min_length=1)

    @model_validator(mode="after")
    def _unique_participants(self) -> Self:
        _ensure_unique(self.participant_ids)
        return self


class ShareInput(BaseModel):
    user_id: UuidText
    amount: PositiveAmount


class CustomExpenseCreate(_ExpenseFields):
    """指定金額: 每人金額大於 0, 加總剛好等於 `amount`。這一筆不用出錢的人不列。"""

    split_mode: Literal[SplitMode.CUSTOM]
    #: 依表上的順序存, 都必須是這個錢包的成員。
    shares: list[ShareInput] = Field(min_length=1)

    @model_validator(mode="after")
    def _shares_add_up(self) -> Self:
        _ensure_unique([share.user_id for share in self.shares])
        if sum(share.amount for share in self.shares) != self.amount:
            raise ValueError(resolve_text(WalletSchemaError.SHARES_NOT_SUM.value))
        return self


#: 新增與修改共用: 修改時所有欄位都可以改, 包括分攤方式。
ExpenseCreate = Annotated[
    EqualExpenseCreate | CustomExpenseCreate, Field(discriminator="split_mode")
]


class ExpenseShare(BaseModel):
    user_id: str
    nickname: str
    #: 均分時可以是 0 (金額少於人數)。
    amount: int


class ExpenseInfo(BaseModel):
    """旅遊錢包的一筆帳。"""

    id: str
    amount: int
    payer: EntryUser
    split_mode: SplitMode
    #: 每人分攤的金額, 均分依加入錢包的順序, 指定金額依表上的順序。
    shares: list[ExpenseShare]
    entry_date: date
    note: str
    created_by: EntryUser
    created_at: UtcDateTime


class ExpensePage(BaseModel):
    """旅遊錢包的帳的一頁, 日期新到舊。`next_cursor` 是 null 表示沒有更多了。"""

    list_data: list[ExpenseInfo]
    next_cursor: str | None


class NetBalanceInfo(BaseModel):
    """一個成員在旅遊錢包的淨額。"""

    user_id: str
    nickname: str
    #: 他付的總額。
    paid: int
    #: 他分攤的總額。
    owed: int
    #: `paid - owed`: 正的是應收, 負的是應付。
    net: int


class NetBalanceList(SimpleListResponse["NetBalanceInfo"]):
    """所有成員的淨額, 依加入錢包的順序; 沒有紀錄的成員是 0。"""


class ShareSnapshot(BaseModel):
    #: 當時的暱稱。
    name: str
    amount: int


class ExpenseSnapshot(BaseModel):
    """異動當時的旅遊錢包帳目內容。名字都是當時的暱稱。"""

    amount: int
    payer_name: str
    split_mode: SplitMode
    shares: list[ShareSnapshot]
    entry_date: date
    note: str


class ExpenseLogInfo(BaseModel):
    """旅遊錢包的一筆異動紀錄。新增沒有 `before`, 刪除沒有 `after`。"""

    id: str
    entry_id: str
    action: EntryLogAction
    actor: EntryUser
    #: 意思同 `EntryLogInfo.as_super_admin`。
    as_super_admin: bool
    before: ExpenseSnapshot | None
    after: ExpenseSnapshot | None
    created_at: UtcDateTime


class ExpenseLogList(SimpleListResponse["ExpenseLogInfo"]):
    """一筆帳的異動紀錄, 新到舊。"""


class ExpenseLogPage(BaseModel):
    """整個旅遊錢包的異動紀錄的一頁, 新到舊, 包含已刪除的帳。"""

    list_data: list[ExpenseLogInfo]
    next_cursor: str | None


class SettlementTransferInfo(BaseModel):
    """清償方案的一筆: `payer` 付給 `payee`。"""

    id: str
    payer: EntryUser
    payee: EntryUser
    amount: int
    #: 付款人標記「我已付款」的時間; 沒標記是 null。
    paid_at: UtcDateTime | None
    #: 確認收款的時間; 還沒確認是 null。
    confirmed_at: UtcDateTime | None
    #: 確認收款的人 (收款人或管理者); 還沒確認是 null。
    confirmed_by: EntryUser | None


class SettlementInfo(BaseModel):
    """旅遊錢包的結算。進行中沒有方案, `transfers` 是空的。"""

    status: WalletStatus
    #: 依付款人加入錢包的順序。
    transfers: list[SettlementTransferInfo]


class SettlementOperate(BaseModel):
    """結算操作之後錢包的狀態: 最後一筆確認收款後是 `settled`。"""

    status: WalletStatus
