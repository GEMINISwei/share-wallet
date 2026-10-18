"use client"

import { StatusBadge } from "@/shared/ui"
import { useLocale, useT } from "@/shared/i18n/context"
import { changedFields } from "../capabilities"
import { snapshotField } from "../format"
import { walletsMessages } from "../i18n"
import type { EntryLogInfo, EntrySnapshot } from "../types"
import LocalDate from "./LocalDate"
import styles from "./wallets.module.css"

const ACTION_TITLE = { create: "logCreate", update: "logUpdate", delete: "logDelete" } as const
const SUMMARY_FIELDS = ["kind", "category_name", "amount", "entry_date", "note"] as const

/** 一筆異動紀錄: 誰、什麼時候、改了什麼。修改列出每個改了的欄位; 新增與刪除列出那筆帳的內容。 */
export default function EntryLogItem({ log }: { log: EntryLogInfo }) {
  const t = useT(walletsMessages)
  const locale = useLocale()
  const { before, after } = log
  const snapshot = after ?? before

  function summary(value: EntrySnapshot) {
    return SUMMARY_FIELDS
      .filter((field) => field !== "note" || value.note)
      .map((field) => snapshotField(field, value, locale).value)
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
      {before && after && changedFields(log).map((field) => {
        const from = snapshotField(field, before, locale)
        const to = snapshotField(field, after, locale)
        return (
          <span key={field} className={styles.logBody}>
            {t("logChange", { field: from.label, before: from.value, after: to.value })}
          </span>
        )
      })}
    </li>
  )
}
