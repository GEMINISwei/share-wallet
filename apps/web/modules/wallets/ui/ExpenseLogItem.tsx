"use client"

import { StatusBadge } from "@/shared/ui"
import { useLocale, useT } from "@/shared/i18n/context"
import { expenseChangedFields } from "../capabilities"
import { expenseSnapshotField, expenseSummaryFields } from "../format"
import { walletsMessages } from "../i18n"
import type { ExpenseLogInfo, ExpenseSnapshot } from "../types"
import LocalDate from "./LocalDate"
import styles from "./wallets.module.css"

const ACTION_TITLE = { create: "logCreate", update: "logUpdate", delete: "logDelete" } as const

/** 旅遊錢包的一筆異動紀錄, 版面同一般錢包的 `EntryLogItem`。 */
export default function ExpenseLogItem({ log }: { log: ExpenseLogInfo }) {
  const t = useT(walletsMessages)
  const locale = useLocale()
  const { before, after } = log
  const snapshot = after ?? before

  function summary(value: ExpenseSnapshot) {
    return expenseSummaryFields(value)
      .map((field) => expenseSnapshotField(field, value, locale).value)
      .join(" · ")
  }

  return (
    <li className={styles.logItem}>
      <span className={styles.logHeader}>
        <span className={styles.rowTitle}>
          {t(ACTION_TITLE[log.action], { actor: log.actor.nickname })}
        </span>
        {log.as_super_admin && <StatusBadge label={t("bySuperAdmin")} variant="warning" />}
      </span>
      <span className={styles.rowMeta}><LocalDate iso={log.created_at} withTime /></span>
      {log.action !== "update" && snapshot && (
        <span className={styles.logBody}>{summary(snapshot)}</span>
      )}
      {before && after && expenseChangedFields(log).map((field) => {
        const from = expenseSnapshotField(field, before, locale)
        const to = expenseSnapshotField(field, after, locale)
        return (
          <span key={field} className={styles.logBody}>
            {t("logChange", { field: from.label, before: from.value, after: to.value })}
          </span>
        )
      })}
    </li>
  )
}
