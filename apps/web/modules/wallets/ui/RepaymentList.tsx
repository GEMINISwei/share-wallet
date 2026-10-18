"use client"

import { useEffect, useState } from "react"
import { useLocale, useT } from "@/shared/i18n/context"
import { loadRepayments } from "../actions"
import { formatEntryDate } from "../format"
import { walletsMessages } from "../i18n"
import type { EntryInfo } from "../types"
import Amount from "./Amount"
import styles from "./wallets.module.css"

type Repayments =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; items: EntryInfo[] }

/** 代墊詳情裡的還款紀錄。每筆還款也是帳目列表裡的一筆, 改刪從那裡打開。 */
export default function RepaymentList(
  { walletId, advanceId }: { walletId: string; advanceId: string },
) {
  const t = useT(walletsMessages)
  const locale = useLocale()
  const [repayments, setRepayments] = useState<Repayments>({ status: "loading" })

  // 呼叫端每打開一筆帳就以新的 `key` 掛載, 所以只在掛載時取一次。
  useEffect(() => {
    let cancelled = false
    loadRepayments(walletId, advanceId).then((res) => {
      if (cancelled) return
      setRepayments(res.status === "success"
        ? { status: "ready", items: res.data.list_data }
        : { status: "failed" })
    })
    return () => { cancelled = true }
  }, [walletId, advanceId])

  return (
    <section>
      <h3 className={styles.sectionTitle}>{t("repayments")}</h3>
      {repayments.status === "loading" && <p className={styles.hint}>{t("loadingMore")}</p>}
      {repayments.status === "failed" && <p className={styles.hint}>{t("repaymentsFailed")}</p>}
      {repayments.status === "ready" && repayments.items.length === 0 && (
        <p className={styles.hint}>{t("noRepayments")}</p>
      )}
      {repayments.status === "ready" && repayments.items.length > 0 && (
        <ul className={`${styles.fieldList} ${styles.owingList}`}>
          {repayments.items.map((item) => (
            <li key={item.id} className={styles.fieldRow}>
              <span>
                {[formatEntryDate(item.entry_date, locale), item.created_by.nickname, item.note]
                  .filter(Boolean).join(" · ")}
              </span>
              <Amount value={item.amount} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
