// Entity 型別一律由後端 OpenAPI 衍生 (`Schema<"…">`), 不手寫形狀。
import type { Schema } from "@/shared/api/contract"

export type WalletInfo = Schema<"WalletInfo">
export type WalletKind = Schema<"WalletKind">
export type MemberInfo = Schema<"MemberInfo">
export type MemberRole = Schema<"MemberRole">
export type CategoryInfo = Schema<"CategoryInfo">
export type CategoryType = Schema<"CategoryType">

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
