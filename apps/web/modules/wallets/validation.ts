// 錢包表單的驗證與轉換。純函式 (收 `locale` 而不是 translator), 所以測得到。
// 規則與後端 `modules/wallets/schema.py` 同一組; 後端仍會再驗一次。

import type { ApiRequestBody } from "@/shared/api/contract"
import { translate, type Translator } from "@/shared/i18n/dictionary"
import type { Locale } from "@/shared/i18n/locale"
import { walletsMessages } from "./i18n"
import type {
  AdjustFormErrors, AdjustFormValues, EntryFormErrors, EntryFormValues, WalletFormErrors,
  WalletFormValues,
} from "./types"

type WalletCreateRequest = ApiRequestBody<"/wallets/", "post">
type WalletUpdateRequest = ApiRequestBody<"/wallets/{id}", "patch">
type AdminWalletCreateRequest = ApiRequestBody<"/admin/wallets/", "post">
type EntryRequest = ApiRequestBody<"/wallets/{id}/entries", "post">
type AdjustRequest = ApiRequestBody<"/wallets/{id}/adjustments", "post">

/** 與後端 `EntryNote` 的上限相同。 */
const NOTE_MAX_LENGTH = 200

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

/** 收支的金額一律大於 0 (見 docs/features.md〈金額〉), 空白不算 0。 */
export function parsePositiveAmount(text: string): number | null {
  if (!text.trim()) return null
  const value = parseAmount(text)
  return value !== null && value > 0 ? value : null
}

function noteError(note: string, t: WalletsT) {
  // 以字元 (code point) 計, 與後端 pydantic 的 max_length 相同; `length` 會把 emoji 算成兩個。
  return [...note.trim()].length > NOTE_MAX_LENGTH
    ? t("noteTooLong", { max: String(NOTE_MAX_LENGTH) })
    : undefined
}

export function validateEntryForm(values: EntryFormValues, locale: Locale): EntryFormErrors {
  const t = translate(walletsMessages, locale)
  return {
    amount: parsePositiveAmount(values.amount) === null ? t("amountPositive") : undefined,
    category_id: values.category_id ? undefined : t("categoryRequired"),
    entry_date: values.entry_date ? undefined : t("dateRequired"),
    note: noteError(values.note, t),
  }
}

/** 已通過 `validateEntryForm` 的表單值 → 記一筆與修改的請求。 */
export function toEntryRequest(values: EntryFormValues): EntryRequest {
  return {
    kind: values.kind,
    amount: parsePositiveAmount(values.amount) ?? 0,
    category_id: values.category_id,
    entry_date: values.entry_date,
    note: values.note.trim(),
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
