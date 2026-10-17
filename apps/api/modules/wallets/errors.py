from shared.http.errors import BaseError, LangText


class WalletError(BaseError):
    # 不是成員也回這個 (404 而不是 403): 不讓人從狀態碼猜出某個 id 的錢包存在。
    NOT_FOUND = LangText(zh="錢包不存在", en="Wallet Not Found")
    NOT_ADMIN = LangText(zh="只有錢包管理者可以這麼做", en="Only wallet admins can do this")
    KIND_MISMATCH = LangText(zh="錢包類型不能修改", en="Wallet type cannot be changed")
    MEMBER_NOT_FOUND = LangText(zh="成員不存在", en="Member Not Found")
    LAST_ADMIN = LangText(
        zh="錢包至少要有一位管理者，請先把其他成員升為管理者",
        en="A wallet needs at least one admin. Promote another member first",
    )
    NO_CATEGORIES = LangText(zh="旅遊錢包沒有分類", en="Travel wallets have no categories")
    CATEGORY_NOT_FOUND = LangText(zh="分類不存在", en="Category Not Found")
    CATEGORY_NAME_EXISTS = LangText(
        zh="同類型已有相同名稱的分類", en="Category Name Already Exists"
    )
