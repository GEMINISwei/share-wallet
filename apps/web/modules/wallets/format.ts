import { HTML_LANG, type Locale } from "@/shared/i18n/locale"
import { translate } from "@/shared/i18n/dictionary"
import { isTransfer } from "./capabilities"
import { walletsMessages } from "./i18n"
import type { EntryInfo, EntryKind, EntrySnapshot, ExpenseInfo, ExpenseSnapshot } from "./types"

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

const KIND_TAG = {
  transfer_out: "transferTag", transfer_in: "transferTag", advance: "advance",
  repayment: "repayment", adjustment: "adjustment",
} as const satisfies Partial<Record<EntryKind, keyof (typeof walletsMessages)["zh"]>>

type EntryRowSource = Pick<EntryInfo, "kind" | "category" | "counterpart_wallet" | "note">
  & Partial<Pick<EntryInfo, "advance_target_name">>

/**
 * 帳目列的三段文字。標題優先用備註 (記帳的人自己寫的最好認); 膠囊是分類, 沒有分類的是類型。
 * 標題被備註佔走時, 轉帳、代墊這類原本的標題 (對方錢包、對象) 移到說明, 不會看不到。
 * 膠囊跟標題一樣時不放, 免得同一個字出現兩次。
 */
export function entryRowText(entry: EntryRowSource, locale: Locale) {
  const base = entryTitle(entry, locale)
  const tag = entryTag(entry, locale)
  if (!entry.note) return { title: base, tag: tag && tag !== base ? tag : null, detail: null }
  // 收支的原本標題就是分類, 已經在膠囊裡了。
  const hasCategory = entry.kind === "income" || entry.kind === "expense"
  return { title: entry.note, tag: tag || null, detail: hasCategory ? null : base }
}

function entryTag({ kind, category }: EntryRowSource, locale: Locale) {
  if (kind === "income" || kind === "expense") return category?.name ?? ""
  return translate(walletsMessages, locale)(KIND_TAG[kind])
}

/** 依日期 (`entry_date`) 分組, 組的順序與組內順序都照列表原本的順序。 */
export function groupByDay<T extends { entry_date: string }>(items: readonly T[]) {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const group = groups.get(item.entry_date)
    if (group) group.push(item)
    else groups.set(item.entry_date, [item])
  }
  return [...groups].map(([day, grouped]) => ({ day, items: grouped }))
}

/** 分組的標題: 今天、昨天用相對的說法 (最常看的就是這兩天), 其他顯示日期。 */
export function dayLabel(day: string, today: string, locale: Locale) {
  const t = translate(walletsMessages, locale)
  if (day === today) return t("today")
  const yesterday = new Date(`${today}T00:00:00Z`)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  if (day === yesterday.toISOString().slice(0, 10)) return t("yesterday")
  return formatEntryDate(day, locale)
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

/** 旅遊錢包的淨額: 正的是應收、負的是應付、0 是已平衡。 */
export function netStatus(net: number): "receivable" | "payable" | "settled" {
  if (net > 0) return "receivable"
  return net < 0 ? "payable" : "settled"
}

/** 旅遊錢包列表上一筆帳的標題: 有備註時用備註, 沒有時是「X 付款」。 */
export function expenseTitle(expense: Pick<ExpenseInfo, "note" | "payer">, locale: Locale) {
  return expense.note || translate(walletsMessages, locale)("paidBy", { name: expense.payer.nickname })
}

const EXPENSE_FIELD_LABEL = {
  amount: "amount", payer_name: "payer", split_mode: "splitMode", shares: "shares",
  entry_date: "entryDate", note: "note",
} as const satisfies Record<keyof ExpenseSnapshot, keyof (typeof walletsMessages)["zh"]>

/** 新增與刪除的紀錄要列出的欄位; 沒有備註就不列。 */
export function expenseSummaryFields(snapshot: ExpenseSnapshot): (keyof ExpenseSnapshot)[] {
  const note = snapshot.note ? ["note" as const] : []
  return ["payer_name", "shares", "amount", "entry_date", ...note]
}

/** 旅遊錢包異動紀錄裡一個欄位的名稱與值。分攤列出每人的金額。 */
export function expenseSnapshotField(
  field: keyof ExpenseSnapshot,
  snapshot: ExpenseSnapshot,
  locale: Locale,
) {
  const t = translate(walletsMessages, locale)
  const separator = locale === "zh" ? "、" : ", "
  const values: Record<keyof ExpenseSnapshot, string> = {
    amount: formatAmount(snapshot.amount, locale),
    payer_name: snapshot.payer_name,
    split_mode: t(snapshot.split_mode),
    shares: snapshot.shares
      .map((share) => `${share.name} ${formatAmount(share.amount, locale)}`)
      .join(separator),
    entry_date: formatEntryDate(snapshot.entry_date, locale),
    note: snapshot.note || t("emptyValue"),
  }
  return { label: t(EXPENSE_FIELD_LABEL[field]), value: values[field] }
}
