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
export type AdvanceTargetInfo = Schema<"AdvanceTargetInfo">
export type ExpenseInfo = Schema<"ExpenseInfo">
export type ExpensePage = Schema<"ExpensePage">
export type ExpenseLogInfo = Schema<"ExpenseLogInfo">
export type ExpenseLogPage = Schema<"ExpenseLogPage">
export type ExpenseSnapshot = Schema<"ExpenseSnapshot">
export type NetBalanceInfo = Schema<"NetBalanceInfo">
export type SplitMode = Schema<"SplitMode">

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
 * 記一筆與修改共用的表單值 (收支、轉帳與代墊)。全部是字串: 金額在送出前才轉換。
 * 收支用 `category_id`, 轉帳用 `counterpart_wallet_id`, 代墊用 `target_name`, 其他留空。
 * 還款不從這裡記, 見 `RepayFormValues`。
 */
export type EntryFormValues = {
  kind: Exclude<EntryKind, "adjustment" | "repayment">
  amount: string
  category_id: string
  counterpart_wallet_id: string
  target_name: string
  entry_date: string
  note: string
}

export type EntryFormErrors = Partial<Record<keyof EntryFormValues, string>>

export type AdjustFormValues = { balance: string; entry_date: string; note: string }

export type AdjustFormErrors = Partial<Record<keyof AdjustFormValues, string>>

/** 新增與修改還款: 對著某一筆代墊, 只填金額、日期、備註。 */
export type RepayFormValues = { amount: string; entry_date: string; note: string }

export type RepayFormErrors = Partial<Record<keyof RepayFormValues, string>>

/** 指定金額表的一列。`key` 只給 React 用: 列可以從中間刪掉, 不能拿 index 當 key。 */
export type ShareRowValues = { key: string; user_id: string; amount: string }

/**
 * 旅遊錢包記一筆與修改的表單值。均分用 `participant_ids`, 指定金額用 `shares`;
 * 切換分攤方式時兩邊都留著, 切回來不用重填。
 */
export type ExpenseFormValues = {
  amount: string
  payer_id: string
  split_mode: SplitMode
  participant_ids: string[]
  shares: ShareRowValues[]
  entry_date: string
  note: string
}

export type ExpenseFormErrors = Partial<Record<keyof ExpenseFormValues, string>>
