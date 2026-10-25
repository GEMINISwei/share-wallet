"use client"

import { useEffect, useState } from "react"
import { Button, Modal } from "@/shared/ui"
import { useLocale, useT } from "@/shared/i18n/context"
import { loadExpenseLogs } from "../actions"
import { formatAmount, formatEntryDate } from "../format"
import { walletsMessages } from "../i18n"
import type { ExpenseInfo, ExpenseLogInfo } from "../types"
import Amount from "./Amount"
import ExpenseLogItem from "./ExpenseLogItem"
import styles from "./wallets.module.css"

type ExpenseDetailDialogProps = {
  walletId: string
  expense: ExpenseInfo
  canEdit: boolean
  canDelete: boolean
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}

type Logs =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; logs: ExpenseLogInfo[] }

function useExpenseLogs(walletId: string, expenseId: string) {
  const [logs, setLogs] = useState<Logs>({ status: "loading" })
  // 呼叫端每打開一筆帳就以新的 `key` 掛載, 所以只在掛載時取一次。
  useEffect(() => {
    let cancelled = false
    loadExpenseLogs(walletId, expenseId).then((res) => {
      if (cancelled) return
      setLogs(res.status === "success" ? { status: "ready", logs: res.data.list_data } : { status: "failed" })
    })
    return () => { cancelled = true }
  }, [walletId, expenseId])
  return logs
}

/** 旅遊錢包的帳目詳情: 付款人、每人分攤、記帳人與這一筆的異動紀錄, 有權限時修改與刪除。 */
export default function ExpenseDetailDialog({
  walletId, expense, canEdit, canDelete, onEdit, onDelete, onClose,
}: ExpenseDetailDialogProps) {
  const t = useT(walletsMessages)
  const locale = useLocale()
  const logs = useExpenseLogs(walletId, expense.id)
  const fields = [
    { label: t("payer"), value: expense.payer.nickname },
    { label: t("splitMode"), value: t(expense.split_mode) },
    { label: t("entryDate"), value: formatEntryDate(expense.entry_date, locale) },
    { label: t("note"), value: expense.note || t("emptyValue") },
    { label: t("recordedBy"), value: expense.created_by.nickname },
  ]

  return (
    <Modal title={t("entryDetail")} open onOpenChange={(next) => { if (!next) onClose() }}>
      <div className={styles.dialogBody}>
        <Amount value={expense.amount} className={styles.detailAmount} />
        <dl className={styles.fieldList}>
          {fields.map((field) => (
            <div key={field.label} className={styles.fieldRow}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
        <section>
          <h3 className={styles.sectionTitle}>{t("shares")}</h3>
          <ul className={`${styles.fieldList} ${styles.owingList}`}>
            {expense.shares.map((share) => (
              <li key={share.user_id} className={styles.fieldRow}>
                <span>{share.nickname}</span>
                <span className={styles.amount}>{formatAmount(share.amount, locale)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className={styles.sectionTitle}>{t("history")}</h3>
          {logs.status === "loading" && <p className={styles.hint}>{t("loadingMore")}</p>}
          {logs.status === "failed" && <p className={styles.hint}>{t("historyFailed")}</p>}
          {logs.status === "ready" && (
            <ul className={styles.logList}>
              {logs.logs.map((log) => <ExpenseLogItem key={log.id} log={log} />)}
            </ul>
          )}
        </section>
        {(canEdit || canDelete) && (
          <div className={styles.dialogActions}>
            {canDelete && <Button variant="outlined" onClick={onDelete}>{t("deleteEntry")}</Button>}
            {canEdit && <Button onClick={onEdit}>{t("edit")}</Button>}
          </div>
        )}
      </div>
    </Modal>
  )
}
