// 錢包表單的驗證與轉換。純函式 (收 `locale` 而不是 translator), 所以測得到。
// 規則與後端 `modules/wallets/schema.py` 同一組; 後端仍會再驗一次。

import type { ApiRequestBody } from "@/shared/api/contract"
import { translate, type Translator } from "@/shared/i18n/dictionary"
import type { Locale } from "@/shared/i18n/locale"
import { isTransfer } from "./capabilities"
import { formatAmount } from "./format"
import { walletsMessages } from "./i18n"
import type {
  AdjustFormErrors, AdjustFormValues, EntryFormErrors, EntryFormValues, ExpenseFormErrors,
  ExpenseFormValues, ExpenseSyncErrors, ExpenseSyncValues, RepayFormErrors, RepayFormValues,
  ShareRowValues, WalletFormErrors,
  WalletFormValues, WalletKind,
} from "./types"

type WalletCreateRequest = ApiRequestBody<"/wallets/", "post">
type WalletUpdateRequest = ApiRequestBody<"/wallets/{id}", "patch">
type AdminWalletCreateRequest = ApiRequestBody<"/admin/wallets/", "post">
type EntryRequest = ApiRequestBody<"/wallets/{id}/entries", "post">
type AdjustRequest = ApiRequestBody<"/wallets/{id}/adjustments", "post">
type TransferRequest = ApiRequestBody<"/wallets/{id}/transfers", "post">
type TransferUpdateRequest = ApiRequestBody<"/wallets/{id}/transfers/{entry_id}", "patch">
type AdvanceRequest = ApiRequestBody<"/wallets/{id}/advances", "post">
type MoneyRequest = ApiRequestBody<"/wallets/{id}/advances/{entry_id}", "patch">
type ExpenseCreateRequest = ApiRequestBody<"/wallets/{id}/expenses", "post">
type ExpenseRequest = ApiRequestBody<"/wallets/{id}/expenses/{expense_id}", "patch">

/** 與後端 `EntryNote` 的上限相同。 */
const NOTE_MAX_LENGTH = 200

/** 與後端 `TargetName` 的上限相同。 */
const TARGET_MAX_LENGTH = 20

const INTEGER = /^-?\d+$/

/** 整數金額; 空白視為 0。不是整數或超出 JS 能精確表示的範圍時回傳 null。 */
export function parseAmount(text: string): number | null {
  const trimmed = text.trim().replaceAll(",", "")
  if (trimmed === "") return 0
  if (!INTEGER.test(trimmed)) return null
  const value = Number(trimmed)
  return Number.isSafeInteger(value) ? value : null
}

type WalletsT = Translator<(typeof walletsMessages)["zh"]>

function travelErrors(values: WalletFormValues, t: WalletsT) {
  const errors: WalletFormErrors = {}
  if (!values.destination.trim()) errors.destination = t("destinationRequired")
  if (!values.start_date) errors.start_date = t("dateRequired")
  if (!values.end_date) errors.end_date = t("dateRequired")
  // ISO 日期 (YYYY-MM-DD) 的字串順序就是日期順序。
  if (values.start_date && values.end_date && values.end_date < values.start_date) {
    errors.end_date = t("endBeforeStart")
  }
  return errors
}

export function validateWalletForm(values: WalletFormValues, locale: Locale): WalletFormErrors {
  const t = translate(walletsMessages, locale)
  const errors: WalletFormErrors = {}
  if (!values.name.trim()) errors.name = t("nameRequired")
  if (values.kind === "travel") return { ...errors, ...travelErrors(values, t) }
  if (parseAmount(values.initial_balance) === null) errors.initial_balance = t("amountInvalid")
  return errors
}

/** 收支的金額一律大於 0 (見 docs/features/amounts.md), 空白不算 0。 */
export function parsePositiveAmount(text: string): number | null {
  if (!text.trim()) return null
  const value = parseAmount(text)
  return value !== null && value > 0 ? value : null
}

// 以字元 (code point) 計, 與後端 pydantic 的 max_length 相同; `length` 會把 emoji 算成兩個。
function charCount(text: string) {
  return [...text.trim()].length
}

function noteError(note: string, t: WalletsT) {
  return charCount(note) > NOTE_MAX_LENGTH
    ? t("noteTooLong", { max: String(NOTE_MAX_LENGTH) })
    : undefined
}

function targetError(values: EntryFormValues, t: WalletsT) {
  if (values.kind !== "advance") return undefined
  if (!values.target_name.trim()) return t("targetRequired")
  return charCount(values.target_name) > TARGET_MAX_LENGTH
    ? t("targetTooLong", { max: String(TARGET_MAX_LENGTH) })
    : undefined
}

/** 收支要選分類, 轉帳要選對方錢包, 代墊要填對象。 */
export function validateEntryForm(values: EntryFormValues, locale: Locale): EntryFormErrors {
  const t = translate(walletsMessages, locale)
  const transfer = isTransfer(values.kind)
  const categorized = values.kind === "income" || values.kind === "expense"
  return {
    amount: parsePositiveAmount(values.amount) === null ? t("amountPositive") : undefined,
    category_id: !categorized || values.category_id ? undefined : t("categoryRequired"),
    counterpart_wallet_id:
      !transfer || values.counterpart_wallet_id ? undefined : t("counterpartRequired"),
    target_name: targetError(values, t),
    entry_date: values.entry_date ? undefined : t("dateRequired"),
    note: noteError(values.note, t),
  }
}

/**
 * 還款的上限是那一筆代墊的未還金額。修改還款時畫面上沒有代墊目前的未還, 傳 null,
 * 上限 (未還 + 原本的金額) 交給後端檢查。
 */
export function validateRepayForm(
  values: RepayFormValues,
  max: number | null,
  locale: Locale,
): RepayFormErrors {
  const t = translate(walletsMessages, locale)
  const amount = parsePositiveAmount(values.amount)
  const amountError = amount === null
    ? t("amountPositive")
    : max !== null && amount > max
      ? t("repaymentExceeds", { amount: formatAmount(max, locale) })
      : undefined
  return {
    amount: amountError,
    entry_date: values.entry_date ? undefined : t("dateRequired"),
    note: noteError(values.note, t),
  }
}

/** 修改代墊、新增或修改還款: 只有金額、日期、備註。 */
export function toMoneyRequest(values: RepayFormValues): MoneyRequest {
  return {
    amount: parsePositiveAmount(values.amount) ?? 0,
    entry_date: values.entry_date,
    note: values.note.trim(),
  }
}

/** 已通過 `validateEntryForm` 的代墊表單值 → 記一筆代墊的請求。 */
export function toAdvanceRequest(values: EntryFormValues): AdvanceRequest {
  return { target_name: values.target_name.trim(), ...toMoneyRequest(values) }
}

/** 已通過 `validateEntryForm` 的收支表單值 → 記一筆與修改的請求。 */
export function toEntryRequest(values: EntryFormValues & { kind: EntryRequest["kind"] }): EntryRequest {
  return {
    kind: values.kind,
    amount: parsePositiveAmount(values.amount) ?? 0,
    category_id: values.category_id,
    entry_date: values.entry_date,
    note: values.note.trim(),
  }
}

/** 已通過 `validateEntryForm` 的轉帳表單值 → 修改轉帳的請求 (只有金額、日期、備註)。 */
export function toTransferUpdateRequest(values: EntryFormValues): TransferUpdateRequest {
  return toMoneyRequest(values)
}

/** 已通過 `validateEntryForm` 的轉帳表單值 → 記一筆轉帳的請求。 */
export function toTransferRequest(
  values: EntryFormValues & { kind: TransferRequest["kind"] },
): TransferRequest {
  return {
    kind: values.kind,
    counterpart_wallet_id: values.counterpart_wallet_id,
    ...toTransferUpdateRequest(values),
  }
}

/** 實際餘額可以是 0 或負的 (例如信用卡), 但要填。 */
export function validateAdjustForm(values: AdjustFormValues, locale: Locale): AdjustFormErrors {
  const t = translate(walletsMessages, locale)
  const balanceError = !values.balance.trim()
    ? t("balanceRequired")
    : parseAmount(values.balance) === null ? t("amountInvalid") : undefined
  return {
    balance: balanceError,
    entry_date: values.entry_date ? undefined : t("dateRequired"),
    note: noteError(values.note, t),
  }
}

export function toAdjustRequest(values: AdjustFormValues): AdjustRequest {
  return {
    balance: parseAmount(values.balance) ?? 0,
    entry_date: values.entry_date,
    note: values.note.trim(),
  }
}

export function hasErrors(errors: Record<string, string | undefined>) {
  return Object.values(errors).some(Boolean)
}

function travelFields(values: WalletFormValues) {
  return {
    destination: values.destination.trim(),
    start_date: values.start_date,
    end_date: values.end_date,
  }
}

/** 建立錢包的空白表單。類型預設跟著使用者正在看的列表分頁 (見 docs/features/wallets.md〈錢包列表〉)。 */
export function emptyWalletForm(kind: WalletKind = "general"): WalletFormValues {
  return { kind, name: "", initial_balance: "", destination: "", start_date: "", end_date: "" }
}

/** 已通過 `validateWalletForm` 的表單值 → 建立錢包的請求。 */
export function toCreateRequest(values: WalletFormValues): WalletCreateRequest {
  const name = values.name.trim()
  if (values.kind === "travel") return { kind: "travel", name, ...travelFields(values) }
  return { kind: "general", name, initial_balance: parseAmount(values.initial_balance) ?? 0 }
}

/** 後台建立錢包時一定要指定一位管理者。 */
export function validateAdminUser(adminUserId: string, locale: Locale): string | undefined {
  return adminUserId ? undefined : translate(walletsMessages, locale)("adminUserRequired")
}

/** 已通過驗證的表單值與管理者 → 後台建立錢包的請求。 */
export function toAdminCreateRequest(
  values: WalletFormValues,
  adminUserId: string,
): AdminWalletCreateRequest {
  return { ...toCreateRequest(values), admin_user_id: adminUserId }
}

/** 已通過驗證的表單值 → 修改設定的請求。類型不能改, 所以一般錢包只送名稱。 */
export function toUpdateRequest(values: WalletFormValues): WalletUpdateRequest {
  const name = values.name.trim()
  if (values.kind === "travel") return { kind: "travel", name, ...travelFields(values) }
  return { kind: "general", name }
}

/** 刪除前要輸入一模一樣的錢包名稱 (前後空白不算)。 */
export function canConfirmDelete(input: string, walletName: string) {
  return input.trim() === walletName
}

/** 總額減去已填的分攤 (空白的列不算), 給指定金額表顯示還差多少。有任何一格不是整數時是 null。 */
export function shareRemainder(amount: string, rows: readonly ShareRowValues[]): number | null {
  const total = parsePositiveAmount(amount)
  if (total === null) return null
  let sum = 0
  for (const row of rows) {
    const value = parseAmount(row.amount)
    if (value === null) return null
    sum += value
  }
  return total - sum
}

function sharesError(values: ExpenseFormValues, locale: Locale, t: WalletsT) {
  const { shares } = values
  if (shares.length === 0) return t("sharesRequired")
  if (shares.some((row) => !row.user_id)) return t("shareUserRequired")
  if (shares.some((row) => parsePositiveAmount(row.amount) === null)) return t("shareAmountPositive")
  if (new Set(shares.map((row) => row.user_id)).size !== shares.length) return t("shareDuplicate")
  const total = parsePositiveAmount(values.amount)
  const remainder = shareRemainder(values.amount, shares)
  if (total === null || remainder === null || remainder === 0) return undefined
  return t("sharesNotSum", {
    sum: formatAmount(total - remainder, locale), amount: formatAmount(total, locale),
  })
}

/** 均分至少勾一個人; 指定金額每列選人、金額大於 0、不重複、加總等於總額 (同後端 schema)。 */
export function validateExpenseForm(values: ExpenseFormValues, locale: Locale): ExpenseFormErrors {
  const t = translate(walletsMessages, locale)
  const equal = values.split_mode === "equal"
  return {
    amount: parsePositiveAmount(values.amount) === null ? t("amountPositive") : undefined,
    payer_id: values.payer_id ? undefined : t("payerRequired"),
    participant_ids:
      !equal || values.participant_ids.length > 0 ? undefined : t("participantsRequired"),
    shares: equal ? undefined : sharesError(values, locale, t),
    entry_date: values.entry_date ? undefined : t("dateRequired"),
    note: noteError(values.note, t),
  }
}

/** 已通過 `validateExpenseForm` 的表單值 → 修改的請求, 也是記一筆的基礎。只送目前分攤方式用到的欄位。 */
export function toExpenseRequest(values: ExpenseFormValues): ExpenseRequest {
  const common = {
    amount: parsePositiveAmount(values.amount) ?? 0,
    payer_id: values.payer_id,
    entry_date: values.entry_date,
    note: values.note.trim(),
  }
  if (values.split_mode === "equal") {
    return { split_mode: "equal", ...common, participant_ids: values.participant_ids }
  }
  return {
    split_mode: "custom",
    ...common,
    shares: values.shares.map((row) => ({
      user_id: row.user_id, amount: parsePositiveAmount(row.amount) ?? 0,
    })),
  }
}

/** 選了要同步的錢包就要選分類; 沒選錢包是不同步, 不用檢查。 */
export function validateExpenseSync(sync: ExpenseSyncValues, locale: Locale): ExpenseSyncErrors {
  const t = translate(walletsMessages, locale)
  return { category_id: sync.wallet_id && !sync.category_id ? t("categoryRequired") : undefined }
}

/** 記一筆的請求: 有選同步的錢包才帶 `sync_to`。 */
export function toExpenseCreateRequest(
  values: ExpenseFormValues, sync: ExpenseSyncValues,
): ExpenseCreateRequest {
  const data = toExpenseRequest(values)
  if (!sync.wallet_id) return data
  return { ...data, sync_to: { wallet_id: sync.wallet_id, category_id: sync.category_id } }
}
