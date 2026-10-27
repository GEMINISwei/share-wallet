"""建立與加入錢包時的預設值: 一般錢包的預設分類、放進哪個群組。"""

from shared.http.errors import LangException, LangText, resolve_text

from .errors import WalletError
from .model import CategoryType, WalletGroupTable, WalletKind

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


async def default_group_id(user_id: str, kind: WalletKind) -> str:
    """這個人某種類型的預設群組, 還沒有就先建。建立與加入錢包時用。"""
    await WalletGroupTable.ensure_defaults(user_id)
    group_id = await WalletGroupTable.find_default_id(user_id, kind)
    # ensure_defaults 之後一定有; 真的沒有表示 user_id 不是合法的 uuid。
    if group_id is None:
        raise LangException(404, WalletError.GROUP_NOT_FOUND)
    return group_id
