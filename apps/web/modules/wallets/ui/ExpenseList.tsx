"use client"

import { useLocale, useT } from "@/shared/i18n/context"
import { loadMoreExpenses } from "../actions"
import { expenseTitle, formatEntryDate } from "../format"
import { walletsMessages } from "../i18n"
import type { ExpenseInfo, ExpensePage } from "../types"
import Amount from "./Amount"
import LoadMoreButton from "./LoadMoreButton"
import { useLoadMore } from "./useLoadMore"
import styles from "./wallets.module.css"

type ExpenseListProps = {
  walletId: string
  firstPage: ExpensePage
  onOpen: (expense: ExpenseInfo) => void
}

/** 旅遊錢包的帳目列表, 排序與「載入更多」同一般錢包的 `EntryList`。 */
export default function ExpenseList({ walletId, firstPage, onOpen }: ExpenseListProps) {
  const t = useT(walletsMessages)
  const { items, hasMore, isPending, failed, loadMore } = useLoadMore(
    firstPage, (cursor) => loadMoreExpenses(walletId, cursor),
  )

  if (items.length === 0) return <p className={styles.hint}>{t("noEntries")}</p>
  return (
    <>
      <ul className={styles.list}>
        {items.map((expense) => (
          <li key={expense.id}>
            <ExpenseRow expense={expense} onOpen={() => onOpen(expense)} />
          </li>
        ))}
      </ul>
      {hasMore && <LoadMoreButton isPending={isPending} failed={failed} onClick={loadMore} />}
    </>
  )
}

function ExpenseRow({ expense, onOpen }: { expense: ExpenseInfo; onOpen: () => void }) {
  const t = useT(walletsMessages)
  const locale = useLocale()
  const meta = [
    formatEntryDate(expense.entry_date, locale),
    // 標題是備註時, 付款人移到這一行。
    expense.note ? t("paidBy", { name: expense.payer.nickname }) : "",
    t("sharesSummary", { count: String(expense.shares.length) }),
  ].filter(Boolean).join(" · ")
  return (
    <button type="button" className={`${styles.row} ${styles.rowButton}`} onClick={onOpen}>
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{expenseTitle(expense, locale)}</span>
        <span className={styles.rowMeta}>{meta}</span>
      </span>
      <Amount value={expense.amount} />
    </button>
  )
}
