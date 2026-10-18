// Entity 型別一律由後端 OpenAPI 衍生 (`Schema<"…">`), 不手寫形狀。
import type { Schema } from "@/shared/api/contract"

export type WalletInfo = Schema<"WalletInfo">
export type WalletKind = Schema<"WalletKind">
export type MemberInfo = Schema<"MemberInfo">
export type MemberRole = Schema<"MemberRole">
export type CategoryInfo = Schema<"CategoryInfo">
export type CategoryType = Schema<"CategoryType">
export type AdminWalletInfo = Schema<"AdminWalletInfo">
export type WalletAdmin = Schema<"WalletAdmin">
export type UserOption = Schema<"UserOption">
export type InviteInfo = Schema<"InviteInfo">
export type InvitePreview = Schema<"InvitePreview">
export type EntryInfo = Schema<"EntryInfo">
export type EntryKind = Schema<"EntryKind">
export type EntryPage = Schema<"EntryPage">
export type EntryLogInfo = Schema<"EntryLogInfo">
export type EntryLogPage = Schema<"EntryLogPage">
export type EntrySnapshot = Schema<"EntrySnapshot">

/** 後台列表的篩選條件 (網址參數)。空字串代表不篩選。 */
export type AdminWalletFilters = { name: string; kind: WalletKind | "" }

/** 建立與設定共用的表單值。全部是字串: 金額與日期在送出前才轉換。 */
export type WalletFormValues = {
  kind: WalletKind
  name: string
  initial_balance: string
  destination: string
  start_date: string
  end_date: string
}

export type WalletFormErrors = Partial<Record<keyof WalletFormValues, string>>

export type TransferKind = Extract<EntryKind, "transfer_out" | "transfer_in">

/** 轉帳的對方錢包選單的一項。 */
export type TransferTarget = { id: string; name: string }

/**
 * 記一筆與修改共用的表單值 (收支與轉帳)。全部是字串: 金額在送出前才轉換。
 * 收支用 `category_id`, 轉帳用 `counterpart_wallet_id`, 另一個留空。
 */
export type EntryFormValues = {
  kind: Exclude<EntryKind, "adjustment">
  amount: string
  category_id: string
  counterpart_wallet_id: string
  entry_date: string
  note: string
}

export type EntryFormErrors = Partial<Record<keyof EntryFormValues, string>>

export type AdjustFormValues = { balance: string; entry_date: string; note: string }

export type AdjustFormErrors = Partial<Record<keyof AdjustFormValues, string>>
