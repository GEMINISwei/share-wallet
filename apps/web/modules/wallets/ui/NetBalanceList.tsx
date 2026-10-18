"use client"

import { ErrorState } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { netStatus } from "../format"
import { walletsMessages } from "../i18n"
import type { NetBalanceInfo } from "../types"
import Amount from "./Amount"
import styles from "./wallets.module.css"

/** 旅遊錢包每人的淨額 (付的 − 分攤的), 依加入順序。正的是應收、負的是應付。 */
export default function NetBalanceList(
  { balances, failed }: { balances: NetBalanceInfo[]; failed: boolean },
) {
  const t = useT(walletsMessages)
  return (
    <section>
      <h2 className={styles.sectionTitle}>{t("netBalances")}</h2>
      {failed ? <ErrorState>{t("netBalancesFailed")}</ErrorState> : (
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
      )}
    </section>
  )
}
