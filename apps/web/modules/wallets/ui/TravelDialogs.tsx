"use client"

import { useActionSubmit } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { deleteExpense } from "../actions"
import { expenseActions } from "../capabilities"
import { walletsMessages } from "../i18n"
import type { ExpenseInfo, MemberInfo, WalletInfo } from "../types"
import ConfirmDialog from "./ConfirmDialog"
import ExpenseDetailDialog from "./ExpenseDetailDialog"
import ExpenseDialog from "./ExpenseDialog"

/** 旅遊錢包頁同一時間只開一個對話框。 */
export type TravelDialog =
  | { kind: "add" }
  | { kind: "detail"; expense: ExpenseInfo }
  | { kind: "edit"; expense: ExpenseInfo }
  | { kind: "delete"; expense: ExpenseInfo }
  | null

type TravelDialogsProps = {
  wallet: WalletInfo
  members: MemberInfo[]
  currentUserId: string
  dialog: TravelDialog
  onChange: (dialog: TravelDialog) => void
  onSaved: (message: string) => void
  onError: (message: string) => void
}

function expenseOf(dialog: TravelDialog, kind: "detail" | "edit" | "delete") {
  return dialog && dialog.kind === kind && "expense" in dialog ? dialog.expense : null
}

/** 記一筆、修改、帳目詳情與刪除確認。 */
export default function TravelDialogs({
  wallet, members, currentUserId, dialog, onChange, onSaved, onError,
}: TravelDialogsProps) {
  const t = useT(walletsMessages)
  const { isPending, submit } = useActionSubmit()
  const close = () => onChange(null)
  const viewer = { userId: currentUserId, canManage: wallet.can_manage }
  const editing = expenseOf(dialog, "edit")
  const detail = expenseOf(dialog, "detail")
  const deleting = expenseOf(dialog, "delete")
  const actions = detail ? expenseActions(detail, viewer) : null

  function confirmDelete(expense: ExpenseInfo) {
    submit(() => deleteExpense(wallet.id, expense.id), {
      onSuccess: () => onSaved(t("entryDeleted")),
      onError: (message) => {
        close()
        onError(message)
      },
      errorFallback: t("entryFailed"),
    })
  }

  return (
    <>
      {(dialog?.kind === "add" || editing) && (
        <ExpenseDialog
          key={editing?.id ?? "new"} walletId={wallet.id} expense={editing} members={members}
          currentUserId={currentUserId} onClose={close} onSuccess={onSaved} onError={onError}
        />
      )}
      {detail && actions && (
        <ExpenseDetailDialog
          key={detail.id} walletId={wallet.id} expense={detail}
          canEdit={actions.edit} canDelete={actions.delete}
          onEdit={() => onChange({ kind: "edit", expense: detail })}
          onDelete={() => onChange({ kind: "delete", expense: detail })}
          onClose={close}
        />
      )}
      <ConfirmDialog
        open={deleting !== null} message={t("deleteExpenseConfirm")} isPending={isPending}
        onConfirm={() => { if (deleting) confirmDelete(deleting) }} onClose={close}
      />
    </>
  )
}
