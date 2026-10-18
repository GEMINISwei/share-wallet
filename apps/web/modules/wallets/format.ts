import { HTML_LANG, type Locale } from "@/shared/i18n/locale"
import { translate } from "@/shared/i18n/dictionary"
import { isTransfer } from "./capabilities"
import { walletsMessages } from "./i18n"
import type { EntryInfo, EntryKind, EntrySnapshot } from "./types"

/** 整數金額加上千分位。不帶幣別: 系統不設幣別 (見 docs/features.md〈金額〉)。 */
export function formatAmount(amount: number, locale: Locale) {
  return new Intl.NumberFormat(HTML_LANG[locale], { maximumFractionDigits: 0 }).format(amount)
}

/**
 * 日期 (不含時間)。`timeZone` 沒給時用執行環境的時區: 伺服器與瀏覽器的時區可能不同,
 * 所以畫面上要經過 `ui/LocalDate` 才不會在 hydration 時對不上。
 */
export function formatDate(iso: string, locale: Locale, timeZone?: string) {
  return new Intl.DateTimeFormat(HTML_LANG[locale], { dateStyle: "medium", timeZone })
    .format(new Date(iso))
}

/** 日期加時間 (到分), 時區的處理同 `formatDate`。 */
export function formatDateTime(iso: string, locale: Locale, timeZone?: string) {
  return new Intl.DateTimeFormat(HTML_LANG[locale], {
    dateStyle: "medium", timeStyle: "short", timeZone,
  }).format(new Date(iso))
}

const OUTFLOW: readonly EntryKind[] = ["expense", "transfer_out", "advance"]

/** 這筆帳讓餘額變多少: 支出、轉出與代墊是負的; 調整的金額本身就是帶正負號的差額。 */
export function signedAmount(kind: EntryKind, amount: number) {
  return OUTFLOW.includes(kind) ? -amount : amount
}

const ADVANCE_TITLE: Partial<Record<EntryKind, "advanceTo" | "repaymentFrom">> = {
  advance: "advanceTo", repayment: "repaymentFrom",
}

/**
 * 列表上一筆帳的標題: 收支是分類, 轉帳是「轉出至 X／轉入自 Y」(對方錢包已刪除時換成
 * 「已刪除的錢包」), 代墊是「代墊給 X」, 還款是「X 還款」。
 */
export function entryTitle(
  entry: Pick<EntryInfo, "kind" | "category" | "counterpart_wallet">
    & Partial<Pick<EntryInfo, "advance_target_name">>,
  locale: Locale,
) {
  const t = translate(walletsMessages, locale)
  if (entry.kind === "adjustment") return t("adjustment")
  const advance = ADVANCE_TITLE[entry.kind]
  if (advance) return t(advance, { name: entry.advance_target_name ?? "" })
  if (isTransfer(entry.kind)) {
    const wallet = entry.counterpart_wallet?.name ?? t("deletedWallet")
    return t(entry.kind === "transfer_out" ? "transferTo" : "transferFrom", { wallet })
  }
  return entry.category?.name ?? ""
}

/** 轉帳的對方錢包名稱; 已刪除時是「已刪除的錢包」。不是轉帳時是 null。 */
export function counterpartName(kind: EntryKind, name: string | null | undefined, locale: Locale) {
  if (!isTransfer(kind)) return null
  return name || translate(walletsMessages, locale)("deletedWallet")
}

/** 使用者所在時區的今天 (YYYY-MM-DD), 記帳日期的預設值。不用 `toISOString()`: 那是 UTC 的日期。 */
export function localToday(now: Date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** 日期 (YYYY-MM-DD, 不含時間) 照原樣的年月日顯示, 不經過時區換算。 */
export function formatEntryDate(day: string, locale: Locale) {
  return formatDate(`${day}T00:00:00Z`, locale, "UTC")
}

const FIELD_LABEL = {
  kind: "entryKind", amount: "amount", category_name: "category",
  counterpart_wallet_name: "counterpartWallet", advance_target_name: "advanceTarget",
  entry_date: "entryDate", note: "note",
} as const satisfies Record<keyof EntrySnapshot, keyof (typeof walletsMessages)["zh"]>

/** 收支列分類, 轉帳列對方錢包, 代墊與還款列對象, 調整都不列。 */
function summaryTarget(kind: EntryKind): (keyof EntrySnapshot)[] {
  if (isTransfer(kind)) return ["counterpart_wallet_name"]
  if (kind === "advance" || kind === "repayment") return ["advance_target_name"]
  return kind === "adjustment" ? [] : ["category_name"]
}

/** 新增與刪除的紀錄要列出的欄位; 沒有備註就不列。 */
export function snapshotSummaryFields(snapshot: EntrySnapshot): (keyof EntrySnapshot)[] {
  const note = snapshot.note ? ["note" as const] : []
  return ["kind", ...summaryTarget(snapshot.kind), "amount", "entry_date", ...note]
}

/** 異動紀錄裡一個欄位的名稱與值。空的分類 (調整) 與備註顯示「（無）」。 */
export function snapshotField(field: keyof EntrySnapshot, snapshot: EntrySnapshot, locale: Locale) {
  const t = translate(walletsMessages, locale)
  const values: Record<keyof EntrySnapshot, string> = {
    kind: t(snapshot.kind),
    amount: formatAmount(snapshot.amount, locale),
    category_name: snapshot.category_name || t("emptyValue"),
    counterpart_wallet_name:
      counterpartName(snapshot.kind, snapshot.counterpart_wallet_name, locale) ?? t("emptyValue"),
    advance_target_name: snapshot.advance_target_name || t("emptyValue"),
    entry_date: formatEntryDate(snapshot.entry_date, locale),
    note: snapshot.note || t("emptyValue"),
  }
  return { label: t(FIELD_LABEL[field]), value: values[field] }
}
