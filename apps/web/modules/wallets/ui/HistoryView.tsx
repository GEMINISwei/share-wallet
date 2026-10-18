"use client"

import { ErrorState } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { loadMoreWalletLogs } from "../actions"
import { walletsMessages } from "../i18n"
import { type WalletArea, walletPath } from "../paths"
import type { EntryLogPage, WalletInfo } from "../types"
import EntryLogItem from "./EntryLogItem"
import LoadMoreButton from "./LoadMoreButton"
import { useLoadMore } from "./useLoadMore"
import WalletShell from "./WalletShell"
import styles from "./wallets.module.css"

type HistoryViewProps = {
  wallet: WalletInfo
  area: WalletArea
  firstPage: EntryLogPage
  errorMessage: string
}

/** 整個錢包的帳目異動紀錄, 新到舊, 包含已刪除的帳。所有成員都看得到。 */
export default function HistoryView({ wallet, area, firstPage, errorMessage }: HistoryViewProps) {
  const t = useT(walletsMessages)
  const { items, hasMore, isPending, failed, loadMore } = useLoadMore(
    firstPage, (cursor) => loadMoreWalletLogs(wallet.id, cursor),
  )

  return (
    <WalletShell
      title={t("history")} subtitle={wallet.name}
      backHref={walletPath(wallet.id, area)} backLabel={t("backToWallet")}
    >
      {errorMessage && <ErrorState>{errorMessage}</ErrorState>}
      {!errorMessage && items.length === 0 && <p className={styles.hint}>{t("noHistory")}</p>}
      {items.length > 0 && (
        <ul className={`${styles.list} ${styles.logList}`}>
          {items.map((log) => <EntryLogItem key={log.id} log={log} />)}
        </ul>
      )}
      {hasMore && <LoadMoreButton isPending={isPending} failed={failed} onClick={loadMore} />}
    </WalletShell>
  )
}
