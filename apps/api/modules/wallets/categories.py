"""一般錢包的分類: 預設分類、列出、新增、改名、封存。

類型 (收入或支出) 建立後不能改, 所以改名的請求根本不收類型。
"""

from sqlalchemy.exc import IntegrityError

from shared.auth.contracts import CurrentUser
from shared.db.table import is_unique_violation
from shared.http.errors import LangException, LangText, resolve_text
from shared.time import utc_now

from .access import WalletAccess, manage_wallet, open_wallet
from .errors import WalletError
from .model import CategoryDetail, CategoryType, WalletCategoryTable, WalletKind
from .schema import CategoryCreate, CategoryInfo, CategoryList, CategoryOperate, CategoryRename

# 建立時依建立者的語系寫成一般文字, 之後就跟使用者自己建的分類一樣, 可以改名與封存。
# 不存成翻譯鍵: 那樣使用者改過名的和沒改過的就要用兩種方式顯示。
DEFAULT_CATEGORIES: list[tuple[CategoryType, LangText]] = [
    (CategoryType.INCOME, LangText(zh="薪資", en="Salary")),
    (CategoryType.INCOME, LangText(zh="獎金", en="Bonus")),
    (CategoryType.INCOME, LangText(zh="投資", en="Investment")),
    (CategoryType.INCOME, LangText(zh="其他", en="Other")),
    (CategoryType.EXPENSE, LangText(zh="餐飲", en="Food")),
    (CategoryType.EXPENSE, LangText(zh="交通", en="Transport")),
    (CategoryType.EXPENSE, LangText(zh="購物", en="Shopping")),
    (CategoryType.EXPENSE, LangText(zh="居家", en="Home")),
    (CategoryType.EXPENSE, LangText(zh="娛樂", en="Entertainment")),
    (CategoryType.EXPENSE, LangText(zh="醫療", en="Medical")),
    (CategoryType.EXPENSE, LangText(zh="其他", en="Other")),
]


def default_categories() -> list[tuple[CategoryType, str]]:
    """預設分類, 名稱是這次請求的語系 (建立錢包的人就是發起請求的人)。"""
    return [(category_type, resolve_text(text)) for category_type, text in DEFAULT_CATEGORIES]


def _ensure_general(access: WalletAccess) -> None:
    # 旅遊錢包不選分類 (見 docs/features.md〈旅遊錢包〉)。
    if access.wallet["kind"] != WalletKind.GENERAL:
        raise LangException(400, WalletError.NO_CATEGORIES)


async def _active_category(wallet_id: str, id: str) -> CategoryDetail:
    category = await WalletCategoryTable.find_detail_active(wallet_id, id)
    if category is None:
        raise LangException(404, WalletError.CATEGORY_NOT_FOUND)
    return category


async def list_categories(wallet_id: str, current_user: CurrentUser) -> CategoryList:
    _ensure_general(await open_wallet(wallet_id, current_user))
    categories = await WalletCategoryTable.list_active(wallet_id)
    items = [CategoryInfo.model_validate(category) for category in categories]
    return CategoryList(list_data=items, count=len(items))


async def create_category(
    wallet_id: str, form_data: CategoryCreate, current_user: CurrentUser
) -> CategoryOperate:
    _ensure_general(await manage_wallet(wallet_id, current_user))
    if await WalletCategoryTable.name_taken(wallet_id, form_data.type, form_data.name):
        raise LangException(409, WalletError.CATEGORY_NAME_EXISTS)
    try:
        created = await WalletCategoryTable.create(
            data={"wallet_id": wallet_id, "type": form_data.type, "name": form_data.name}
        )
    except IntegrityError as exc:
        if not is_unique_violation(exc):
            raise
        # 上面查過之後、寫入之前被另一個請求搶先建了同名的分類。
        raise LangException(409, WalletError.CATEGORY_NAME_EXISTS) from exc
    return CategoryOperate(id=created["id"])


async def rename_category(
    wallet_id: str, id: str, form_data: CategoryRename, current_user: CurrentUser
) -> CategoryOperate:
    _ensure_general(await manage_wallet(wallet_id, current_user))
    category = await _active_category(wallet_id, id)
    if await WalletCategoryTable.name_taken(
        wallet_id, category["type"], form_data.name, exclude_id=id
    ):
        raise LangException(409, WalletError.CATEGORY_NAME_EXISTS)
    try:
        await WalletCategoryTable.update_by_id(id=id, data={"name": form_data.name})
    except IntegrityError as exc:
        if not is_unique_violation(exc):
            raise
        raise LangException(409, WalletError.CATEGORY_NAME_EXISTS) from exc
    return CategoryOperate(id=id)


async def archive_category(wallet_id: str, id: str, current_user: CurrentUser) -> CategoryOperate:
    """刪除分類是封存 (見 docs/features.md〈分類〉)。"""
    _ensure_general(await manage_wallet(wallet_id, current_user))
    await _active_category(wallet_id, id)
    await WalletCategoryTable.update_by_id(id=id, data={"archived_at": utc_now()})
    return CategoryOperate(id=id)
