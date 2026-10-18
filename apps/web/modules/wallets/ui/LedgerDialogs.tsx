"use client"

import { useActionSubmit } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { deleteEntry } from "../actions"
import { canTransfer, entryActions } from "../capabilities"
import { walletsMessages } from "../i18n"
import type { CategoryInfo, EntryInfo, TransferTarget, WalletInfo } from "../types"
import AdjustDialog from "./AdjustDialog"
import ConfirmDialog from "./ConfirmDialog"
import EntryDetailDialog from "./EntryDetailDialog"
import EntryDialog from "./EntryDialog"

/** 錢包頁同一時間只開一個對話框。 */
export type LedgerDialog =
  | { kind: "add" }
  | { kind: "adjust" }
  | { kind: "detail"; entry: EntryInfo }
  | { kind: "edit"; entry: EntryInfo }
  | { kind: "delete"; entry: EntryInfo }
  | null

type LedgerDialogsProps = {
  wallet: WalletInfo
  categories: CategoryInfo[]
  transferTargets: TransferTarget[]
  currentUserId: string
  dialog: LedgerDialog
  onChange: (dialog: LedgerDialog) => void
  onSaved: (message: string) => void
  onError: (message: string) => void
}

function entryOf(dialog: LedgerDialog, kind: "detail" | "edit" | "delete") {
  return dialog && dialog.kind === kind && "entry" in dialog ? dialog.entry : null
}

/** 記一筆、修改、調整餘額、帳目詳情與刪除確認。 */
export default function LedgerDialogs({
  wallet, categories, transferTargets, currentUserId, dialog, onChange, onSaved, onError,
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

  const editing = entryOf(dialog, "edit")
  const detail = entryOf(dialog, "detail")
  const deleting = entryOf(dialog, "delete")
  const actions = detail ? entryActions(detail, viewer) : null

  return (
    <>
      {(dialog?.kind === "add" || editing) && (
        <EntryDialog
          key={editing?.id ?? "new"} walletId={wallet.id} entry={editing} categories={categories}
          transferTargets={transferTargets} transferable={canTransfer(wallet, transferTargets)}
          open onClose={close} onSuccess={onSaved} onError={onError}
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
          canEdit={actions.edit} canDelete={actions.delete}
          onEdit={() => onChange({ kind: "edit", entry: detail })}
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
