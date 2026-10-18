"use client"

import { useEffect, useState } from "react"
import { Button, Modal } from "@/shared/ui"
import { useLocale, useT } from "@/shared/i18n/context"
import { loadEntryLogs } from "../actions"
import { counterpartName, formatEntryDate, signedAmount } from "../format"
import { walletsMessages } from "../i18n"
import type { EntryInfo, EntryLogInfo } from "../types"
import Amount from "./Amount"
import EntryLogItem from "./EntryLogItem"
import styles from "./wallets.module.css"

type EntryDetailDialogProps = {
  walletId: string
  entry: EntryInfo
  canEdit: boolean
  canDelete: boolean
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}

type Logs = { status: "loading" } | { status: "failed" } | { status: "ready"; logs: EntryLogInfo[] }

/** 帳目詳情: 欄位、記帳人、這一筆的異動紀錄, 有權限時修改與刪除。 */
export default function EntryDetailDialog({
  walletId, entry, canEdit, canDelete, onEdit, onDelete, onClose,
}: EntryDetailDialogProps) {
  const t = useT(walletsMessages)
  const locale = useLocale()
  const [logs, setLogs] = useState<Logs>({ status: "loading" })

  // 呼叫端每打開一筆帳就以新的 `key` 掛載, 所以只在掛載時取一次。
  useEffect(() => {
    let cancelled = false
    loadEntryLogs(walletId, entry.id).then((res) => {
      if (cancelled) return
      setLogs(res.status === "success" ? { status: "ready", logs: res.data.list_data } : { status: "failed" })
    })
    return () => { cancelled = true }
  }, [walletId, entry.id])

  const counterpart = counterpartName(entry.kind, entry.counterpart_wallet?.name, locale)
  const fields = [
    { label: t("entryKind"), value: t(entry.kind) },
    counterpart === null
      ? { label: t("category"), value: entry.category?.name ?? t("emptyValue") }
      : { label: t("counterpartWallet"), value: counterpart },
    { label: t("entryDate"), value: formatEntryDate(entry.entry_date, locale) },
    { label: t("note"), value: entry.note || t("emptyValue") },
    { label: t("recordedBy"), value: entry.created_by.nickname },
  ]

  return (
    <Modal title={t("entryDetail")} open onOpenChange={(next) => { if (!next) onClose() }}>
      <div className={styles.dialogBody}>
        <Amount value={signedAmount(entry.kind, entry.amount)} className={styles.detailAmount} />
        <dl className={styles.fieldList}>
          {fields.map((field) => (
            <div key={field.label} className={styles.fieldRow}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
        <section>
          <h3 className={styles.sectionTitle}>{t("history")}</h3>
          {logs.status === "loading" && <p className={styles.hint}>{t("loadingMore")}</p>}
          {logs.status === "failed" && <p className={styles.hint}>{t("historyFailed")}</p>}
          {logs.status === "ready" && (
            <ul className={styles.logList}>
              {logs.logs.map((log) => <EntryLogItem key={log.id} log={log} />)}
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
