from shared.http.errors import BaseError, LangText


class WalletError(BaseError):
    # 不是成員也回這個 (404 而不是 403): 不讓人從狀態碼猜出某個 id 的錢包存在。
    NOT_FOUND = LangText(zh="錢包不存在", en="Wallet Not Found")
    NOT_ADMIN = LangText(zh="只有錢包管理者可以這麼做", en="Only wallet admins can do this")
    KIND_MISMATCH = LangText(zh="錢包類型不能修改", en="Wallet type cannot be changed")
    ADMIN_USER_INVALID = LangText(
        zh="指定的管理者不存在或已停用", en="The chosen admin does not exist or is disabled"
    )
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
    # 過期、撤銷、錢包已刪除都是這一個: 不讓拿到舊連結的人分辨錢包還在不在。
    INVITE_INVALID = LangText(
        zh="連結無效或已過期，請向管理者要新的連結",
        en="This invite link is invalid or has expired. Ask a wallet admin for a new one",
    )
    NOT_GENERAL = LangText(zh="只有一般錢包可以記收支", en="Only general wallets have entries")
    ENTRY_NOT_FOUND = LangText(zh="帳目不存在", en="Entry Not Found")
    NOT_ENTRY_OWNER = LangText(
        zh="只能修改、刪除自己記的帳", en="You can only change entries you recorded"
    )
    CATEGORY_TYPE_MISMATCH = LangText(
        zh="分類的類型與收支不符", en="The category does not match the entry type"
    )
    BALANCE_UNCHANGED = LangText(zh="餘額沒有變化", en="The balance is already this amount")
    BALANCE_OUT_OF_RANGE = LangText(zh="餘額超出可記錄的範圍", en="The balance is out of range")
    ADJUSTMENT_IMMUTABLE = LangText(
        zh="調整不能修改，請刪除後重新調整",
        en="Adjustments cannot be edited. Delete it and adjust again",
    )
