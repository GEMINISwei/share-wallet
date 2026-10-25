"use client"

import { Button, ErrorState, Modal } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { netStatus } from "../format"
import { walletsMessages } from "../i18n"
import type { NetBalanceInfo } from "../types"
import Amount from "./Amount"
import styles from "./wallets.module.css"

type NetBalanceProps = { balances: NetBalanceInfo[]; failed: boolean }

/** 旅遊錢包每人的淨額 (付的 − 分攤的), 依加入順序。正的是應收、負的是應付。 */
function NetBalanceRows({ balances, failed }: NetBalanceProps) {
  const t = useT(walletsMessages)
  if (failed) return <ErrorState>{t("netBalancesFailed")}</ErrorState>
  return (
    <ul className={styles.list}>
      {balances.map((balance) => (
        <li key={balance.user_id} className={styles.row}>
          <span className={styles.rowMain}>
            <span className={styles.rowTitle}>{balance.nickname}</span>
            <span className={styles.rowMeta}>{t(netStatus(balance.net))}</span>
          </span>
          <Amount value={balance.net} />
        </li>
      ))}
    </ul>
  )
}

/** 桌機錢包頁上的每人淨額; 手機收進選單 (`NetBalancesDialog`)。 */
export default function NetBalanceList(props: NetBalanceProps) {
  const t = useT(walletsMessages)
  return (
    <section className={styles.desktopOnly}>
      <h2 className={styles.sectionTitle}>{t("netBalances")}</h2>
      <NetBalanceRows {...props} />
    </section>
  )
}

export function NetBalancesDialog(
  { open, onClose, ...props }: NetBalanceProps & { open: boolean; onClose: () => void },
) {
  const t = useT(walletsMessages)
  return (
    <Modal title={t("netBalances")} open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <NetBalanceRows {...props} />
      <div className={styles.dialogActions}>
        <Button variant="outlined" onClick={onClose}>{t("close")}</Button>
      </div>
    </Modal>
  )
}
