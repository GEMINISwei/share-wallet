// 錢包表單的驗證與轉換。純函式 (收 `locale` 而不是 translator), 所以測得到。
// 規則與後端 `modules/wallets/schema.py` 同一組; 後端仍會再驗一次。

import type { ApiRequestBody } from "@/shared/api/contract"
import { translate, type Translator } from "@/shared/i18n/dictionary"
import type { Locale } from "@/shared/i18n/locale"
import { walletsMessages } from "./i18n"
import type { WalletFormErrors, WalletFormValues } from "./types"

type WalletCreateRequest = ApiRequestBody<"/wallets/", "post">
type WalletUpdateRequest = ApiRequestBody<"/wallets/{id}", "patch">

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

export function hasErrors(errors: WalletFormErrors) {
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
