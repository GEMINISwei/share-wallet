"use client"

import { ErrorState } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { loadMoreExpenseLogs, loadMoreWalletLogs } from "../actions"
import { walletsMessages } from "../i18n"
import { type WalletArea, walletPath } from "../paths"
import type { EntryLogPage, ExpenseLogPage, WalletInfo } from "../types"
import EntryLogItem from "./EntryLogItem"
import ExpenseLogItem from "./ExpenseLogItem"
import LoadMoreButton from "./LoadMoreButton"
import { useLoadMore } from "./useLoadMore"
import WalletShell from "./WalletShell"
import styles from "./wallets.module.css"

/** 第一頁的紀錄, 依錢包類型是兩種快照之一。 */
export type HistoryPage =
  | { kind: "general"; data: EntryLogPage }
  | { kind: "travel"; data: ExpenseLogPage }

type HistoryViewProps = {
  wallet: WalletInfo
  area: WalletArea
  firstPage: HistoryPage
  errorMessage: string
}

/** 整個錢包的帳目異動紀錄, 新到舊, 包含已刪除的帳。所有成員都看得到。 */
export default function HistoryView({ wallet, area, firstPage, errorMessage }: HistoryViewProps) {
  const t = useT(walletsMessages)
  return (
    <WalletShell
      title={t("history")} subtitle={wallet.name}
      backHref={walletPath(wallet.id, area)} backLabel={t("backToWallet")}
    >
      {errorMessage && <ErrorState>{errorMessage}</ErrorState>}
      {!errorMessage && (firstPage.kind === "travel"
        ? <ExpenseLogs walletId={wallet.id} firstPage={firstPage.data} />
        : <EntryLogs walletId={wallet.id} firstPage={firstPage.data} />)}
    </WalletShell>
  )
}

function EntryLogs({ walletId, firstPage }: { walletId: string; firstPage: EntryLogPage }) {
  const more = useLoadMore(firstPage, (cursor) => loadMoreWalletLogs(walletId, cursor))
  return (
    <LogList {...more}>
      {more.items.map((log) => <EntryLogItem key={log.id} log={log} />)}
    </LogList>
  )
}

function ExpenseLogs({ walletId, firstPage }: { walletId: string; firstPage: ExpenseLogPage }) {
  const more = useLoadMore(firstPage, (cursor) => loadMoreExpenseLogs(walletId, cursor))
  return (
    <LogList {...more}>
      {more.items.map((log) => <ExpenseLogItem key={log.id} log={log} />)}
    </LogList>
  )
}

type LogListProps = {
  items: readonly unknown[]
  hasMore: boolean
  isPending: boolean
  failed: boolean
  loadMore: () => void
  children: React.ReactNode
}

function LogList({ items, hasMore, isPending, failed, loadMore, children }: LogListProps) {
  const t = useT(walletsMessages)
  return (
    <>
      {items.length === 0
        ? <p className={styles.hint}>{t("noHistory")}</p>
        : <ul className={`${styles.list} ${styles.logList}`}>{children}</ul>}
      {hasMore && <LoadMoreButton isPending={isPending} failed={failed} onClick={loadMore} />}
    </>
  )
}
