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
    FAVORITE_NOT_MEMBER = LangText(
        zh="只有錢包成員可以設為最愛", en="Only wallet members can mark a wallet as favorite"
    )
    GROUP_NOT_FOUND = LangText(zh="錢包群組不存在", en="Wallet Group Not Found")
    GROUP_NAME_EXISTS = LangText(
        zh="同類型已有相同名稱的群組", en="Wallet Group Name Already Exists"
    )
    GROUP_LIMIT = LangText(
        zh="每種類型最多 20 個群組", en="You can have at most 20 groups of each type"
    )
    DEFAULT_GROUP_FIXED = LangText(
        zh="預設群組不能改名或刪除", en="The default group cannot be renamed or deleted"
    )
    GROUP_KIND_MISMATCH = LangText(
        zh="錢包只能放進同類型的群組", en="A wallet can only go into a group of the same type"
    )
    PLACEMENT_NOT_MEMBER = LangText(
        zh="只有錢包成員可以設定群組與顯示",
        en="Only wallet members can choose its group or hide it",
    )
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
    ENTRY_KIND_IMMUTABLE = LangText(
        zh="轉帳與收支不能互相切換", en="Transfers and income or expenses cannot be switched"
    )
    TRANSFER_SAME_WALLET = LangText(
        zh="不能轉給同一個錢包", en="Cannot transfer to the same wallet"
    )
    # 沒加入也回這個: 跟 NOT_FOUND 一樣不透露別人的錢包存不存在。
    TRANSFER_WALLET_NOT_FOUND = LangText(zh="對方錢包不存在", en="The other wallet was not found")
    TRANSFER_NOT_GENERAL = LangText(
        zh="只能轉到一般錢包", en="You can only transfer to a general wallet"
    )
    TRANSFER_NOT_MEMBER = LangText(
        zh="要同時是兩個錢包的成員才能轉帳",
        en="You need to be a member of both wallets to transfer",
    )
    TRANSFER_NO_ACCESS = LangText(
        zh="要在兩個錢包都有權限才能修改、刪除這筆轉帳",
        en="You need permission in both wallets to change this transfer",
    )
    TRANSFER_ORPHAN_IMMUTABLE = LangText(
        zh="對方錢包已刪除，這筆轉帳只能刪除",
        en="The other wallet was deleted. This transfer can only be deleted",
    )
    ADVANCE_KIND_IMMUTABLE = LangText(
        zh="代墊與還款不能與其他類型互相切換",
        en="Advances and repayments cannot be switched to another type",
    )
    ADVANCE_NOT_FOUND = LangText(zh="代墊不存在", en="Advance Not Found")
    REPAYMENT_EXCEEDS_OUTSTANDING = LangText(
        zh="還款不可超過未還金額", en="The repayment cannot exceed the outstanding amount"
    )
    ADVANCE_BELOW_REPAID = LangText(
        zh="代墊金額不可小於已還的金額",
        en="The advance cannot be less than what has been repaid",
    )
    ADVANCE_HAS_REPAYMENTS = LangText(
        zh="這筆代墊已有還款，請先刪除還款",
        en="This advance has repayments. Delete them first",
    )
    NOT_TRAVEL = LangText(
        zh="只有旅遊錢包可以記分攤", en="Only travel wallets have shared expenses"
    )
    PAYER_NOT_MEMBER = LangText(
        zh="付款人必須是這個錢包的成員", en="The payer must be a member of this wallet"
    )
    PARTICIPANT_NOT_MEMBER = LangText(
        zh="分攤對象必須是這個錢包的成員",
        en="Everyone sharing the cost must be a member of this wallet",
    )
    MEMBER_HAS_RECORDS = LangText(
        zh="這位成員在這個錢包有付款或分攤紀錄，不能離開或被移除",
        en="This member has payments or shares in this wallet and cannot leave or be removed",
    )
    LEDGER_LOCKED = LangText(
        zh="結算中或已結帳的錢包不能修改帳目",
        en="Entries cannot be changed while settling or after settlement",
    )
    WALLET_ARCHIVED = LangText(
        zh="已結帳的錢包只能查看", en="This wallet has been settled and is read-only"
    )
    SETTLEMENT_STARTED = LangText(
        zh="這個錢包已經開始結算", en="Settlement has already started for this wallet"
    )
    NO_EXPENSES_TO_SETTLE = LangText(
        zh="還沒有任何帳目，不能開始結算", en="There are no entries to settle yet"
    )
    NOT_SETTLING = LangText(zh="這個錢包不在結算中", en="This wallet is not being settled")
    SETTLEMENT_TRANSFER_NOT_FOUND = LangText(zh="這筆轉帳不存在", en="Transfer Not Found")
    NOT_SETTLEMENT_PAYER = LangText(
        zh="只有付款人可以標記付款", en="Only the payer can mark this as paid"
    )
    SETTLEMENT_CONFIRMED = LangText(
        zh="這筆已經確認收款", en="This transfer has already been confirmed"
    )
    PAYER_CANNOT_CONFIRM = LangText(
        zh="付款人不能確認自己的付款", en="The payer cannot confirm their own payment"
    )
    NOT_SETTLEMENT_PAYEE = LangText(
        zh="只有收款人或管理者可以確認收款", en="Only the payee or an admin can confirm"
    )
    NOT_CONFIRMER = LangText(
        zh="只有確認的人或管理者可以撤銷確認",
        en="Only whoever confirmed it or an admin can undo the confirmation",
    )
