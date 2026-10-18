"use client"

import { useActionSubmit } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { deleteEntry } from "../actions"
import { canRepay, canTransfer, entryActions } from "../capabilities"
import { walletsMessages } from "../i18n"
import type { CategoryInfo, EntryInfo, TransferTarget, WalletInfo } from "../types"
import AdjustDialog from "./AdjustDialog"
import ConfirmDialog from "./ConfirmDialog"
import EntryDetailDialog from "./EntryDetailDialog"
import EntryDialog from "./EntryDialog"
import RepaymentDialog, { type RepaymentTarget } from "./RepaymentDialog"

/** 錢包頁同一時間只開一個對話框。 */
export type LedgerDialog =
  | { kind: "add" }
  | { kind: "adjust" }
  | { kind: "detail"; entry: EntryInfo }
  | { kind: "edit"; entry: EntryInfo }
  | { kind: "delete"; entry: EntryInfo }
  | { kind: "repay"; entry: EntryInfo }
  | null

type LedgerDialogsProps = {
  wallet: WalletInfo
  categories: CategoryInfo[]
  transferTargets: TransferTarget[]
  targetNames: string[]
  currentUserId: string
  dialog: LedgerDialog
  onChange: (dialog: LedgerDialog) => void
  onSaved: (message: string) => void
  onError: (message: string) => void
}

function entryOf(dialog: LedgerDialog, kind: "detail" | "edit" | "delete" | "repay") {
  return dialog && dialog.kind === kind && "entry" in dialog ? dialog.entry : null
}

/** 還款與修改還款用自己的對話框 (只有金額、日期、備註), 其他的修改用記一筆的。 */
function repaymentTarget(dialog: LedgerDialog): RepaymentTarget | null {
  const repaying = entryOf(dialog, "repay")
  if (repaying) return { kind: "create", advance: repaying }
  const editing = entryOf(dialog, "edit")
  return editing?.kind === "repayment" ? { kind: "edit", repayment: editing } : null
}

/** 記一筆、修改、調整餘額、還款、帳目詳情與刪除確認。 */
export default function LedgerDialogs({
  wallet, categories, transferTargets, targetNames, currentUserId, dialog, onChange, onSaved,
  onError,
}: LedgerDialogsProps) {
  const t = useT(walletsMessages)
  const { isPending, submit } = useActionSubmit()
  const close = () => onChange(null)
  const viewer = { userId: currentUserId, canManage: wallet.can_manage }

  function confirmDelete(entry: EntryInfo) {
    submit(() => deleteEntry(wallet.id, entry.id), {
      onSuccess: () => onSaved(t("entryDeleted")),
      onError: (message) => {
        close()
        onError(message)
      },
      errorFallback: t("entryFailed"),
    })
  }

  const repayment = repaymentTarget(dialog)
  const edited = entryOf(dialog, "edit")
  const editing = edited?.kind === "repayment" ? null : edited
  const detail = entryOf(dialog, "detail")
  const deleting = entryOf(dialog, "delete")
  const actions = detail ? entryActions(detail, viewer) : null

  return (
    <>
      {(dialog?.kind === "add" || editing) && (
        <EntryDialog
          key={editing?.id ?? "new"} walletId={wallet.id} entry={editing} categories={categories}
          targetNames={targetNames} transferTargets={transferTargets}
          transferable={canTransfer(wallet, transferTargets)}
          open onClose={close} onSuccess={onSaved} onError={onError}
        />
      )}
      {repayment && (
        <RepaymentDialog
          walletId={wallet.id} target={repayment}
          onClose={close} onSuccess={onSaved} onError={onError}
        />
      )}
      {dialog?.kind === "adjust" && (
        <AdjustDialog
          walletId={wallet.id} balance={wallet.balance ?? 0} open
          onClose={close} onSuccess={onSaved} onError={onError}
        />
      )}
      {detail && actions && (
        <EntryDetailDialog
          key={detail.id} walletId={wallet.id} entry={detail}
          canEdit={actions.edit} canDelete={actions.delete} canRepay={canRepay(detail)}
          onEdit={() => onChange({ kind: "edit", entry: detail })}
          onRepay={() => onChange({ kind: "repay", entry: detail })}
          onDelete={() => onChange({ kind: "delete", entry: detail })}
          onClose={close}
        />
      )}
      <ConfirmDialog
        open={deleting !== null} message={t("deleteEntryConfirm")} isPending={isPending}
        onConfirm={() => { if (deleting) confirmDelete(deleting) }} onClose={close}
      />
    </>
  )
}
