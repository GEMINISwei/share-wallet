"use client"

import { Button, Modal } from "@/shared/ui"
import { useLocale, useT } from "@/shared/i18n/context"
import type { Translator } from "@/shared/i18n/dictionary"
import type { Locale } from "@/shared/i18n/locale"
import { counterpartName, formatAmount, formatEntryDate, signedAmount } from "../format"
import { walletsMessages } from "../i18n"
import type { EntryInfo } from "../types"
import Amount from "./Amount"
import RepaymentList from "./RepaymentList"
import styles from "./wallets.module.css"

type EntryDetailDialogProps = {
  walletId: string
  entry: EntryInfo
  canEdit: boolean
  canDelete: boolean
  /** 還有未還金額的代墊 (見 `canRepay`)。 */
  canRepay: boolean
  onEdit: () => void
  onRepay: () => void
  onDelete: () => void
  onClose: () => void
}

type T = Translator<(typeof walletsMessages)["zh"]>

/** 分類那一欄: 收支是分類, 轉帳是對方錢包, 代墊與還款是對象 (代墊再加上未還)。 */
function targetFields(entry: EntryInfo, t: T, counterpart: string | null, locale: Locale) {
  if (counterpart !== null) return [{ label: t("counterpartWallet"), value: counterpart }]
  if (entry.kind === "advance" || entry.kind === "repayment") {
    const target = { label: t("advanceTarget"), value: entry.advance_target_name ?? "" }
    if (entry.outstanding === null) return [target]
    return [target, { label: t("outstanding"), value: formatAmount(entry.outstanding, locale) }]
  }
  return [{ label: t("category"), value: entry.category?.name ?? t("emptyValue") }]
}

/** 帳目詳情: 欄位與記帳人, 有權限時修改與刪除; 代墊另有還款紀錄與還款。 */
export default function EntryDetailDialog({
  walletId, entry, canEdit, canDelete, canRepay, onEdit, onDelete, onRepay, onClose,
}: EntryDetailDialogProps) {
  const t = useT(walletsMessages)
  const locale = useLocale()

  const counterpart = counterpartName(entry.kind, entry.counterpart_wallet?.name, locale)
  const fields = [
    { label: t("entryKind"), value: t(entry.kind) },
    ...targetFields(entry, t, counterpart, locale),
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
        {entry.kind === "advance" && <RepaymentList walletId={walletId} advanceId={entry.id} />}
        {(canEdit || canDelete || canRepay) && (
          <div className={styles.dialogActions}>
            {canDelete && <Button variant="outlined" onClick={onDelete}>{t("deleteEntry")}</Button>}
            {canEdit && (
              <Button variant={canRepay ? "outlined" : undefined} onClick={onEdit}>{t("edit")}</Button>
            )}
            {canRepay && <Button onClick={onRepay}>{t("repay")}</Button>}
          </div>
        )}
      </div>
    </Modal>
  )
}
