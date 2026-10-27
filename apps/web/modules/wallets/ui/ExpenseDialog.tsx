"use client"

import { type FormEvent, useState } from "react"
import { ChoiceGroup, FormDialog, TextInput, useActionSubmit } from "@/shared/ui"
import { useLocale, useT } from "@/shared/i18n/context"
import { createExpense, updateExpense } from "../actions"
import { canSyncExpense, initialExpenseValues, NO_SYNC, syncAfterPayerChange } from "../capabilities"
import { localToday } from "../format"
import { walletsMessages } from "../i18n"
import type {
  ExpenseFormErrors, ExpenseFormValues, ExpenseInfo, ExpenseSyncErrors, MemberInfo, SplitMode,
} from "../types"
import {
  hasErrors, toExpenseCreateRequest, toExpenseRequest, validateExpenseForm, validateExpenseSync,
} from "../validation"
import { CustomShares, EqualShares } from "./ExpenseShares"
import ExpenseSyncFields from "./ExpenseSyncFields"

type ExpenseDialogProps = {
  walletId: string
  /** 標題下方顯示記在哪個錢包, 理由同 `EntryDialog`。 */
  walletName: string
  /** 有值是修改, 沒有是記一筆。 */
  expense: ExpenseInfo | null
  /** 加入錢包的順序; 付款人與分攤對象只能從這裡選。 */
  members: MemberInfo[]
  currentUserId: string
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (message: string) => void
}

const SPLIT_MODES: SplitMode[] = ["equal", "custom"]

/** 旅遊錢包記一筆與修改: 金額、付款人、分攤 (均分或指定金額)、日期、備註; 記一筆時可以同步到一般錢包。 */
export default function ExpenseDialog({
  walletId, walletName, expense, members, currentUserId, onClose, onSuccess, onError,
}: ExpenseDialogProps) {
  const t = useT(walletsMessages)
  const locale = useLocale()
  const [values, setValues] = useState(
    () => initialExpenseValues(expense, members, currentUserId, localToday()),
  )
  const [errors, setErrors] = useState<ExpenseFormErrors>({})
  const [sync, setSync] = useState(NO_SYNC)
  const [syncErrors, setSyncErrors] = useState<ExpenseSyncErrors>({})
  const syncable = canSyncExpense(expense, values.payer_id, currentUserId)
  const { isPending, submit, fieldError } = useActionSubmit()

  function change<K extends keyof ExpenseFormValues>(field: K, value: ExpenseFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found = validateExpenseForm(values, locale)
    const foundSync = validateExpenseSync(sync, locale)
    setErrors(found)
    setSyncErrors(foundSync)
    if (hasErrors(found) || hasErrors(foundSync)) return
    const save = expense
      ? () => updateExpense(walletId, expense.id, toExpenseRequest(values))
      : () => createExpense(walletId, toExpenseCreateRequest(values, sync))
    submit(save, {
      onSuccess: () => onSuccess(expense ? t("entryUpdated") : t("entryCreated")),
      onError,
      errorFallback: t("entryFailed"),
    })
  }

  return (
    <FormDialog
      title={expense ? t("editEntry") : t("addEntry")} subtitle={walletName} fullScreen open
      isPending={isPending} submitText={t("save")} pendingText={t("saving")} onClose={onClose}
      onSubmit={handleSubmit}
    >
      <TextInput
        label={t("amount")} value={values.amount} required disabled={isPending} autoFocus
        size="display" inputMode="numeric" placeholder="0"
        error={errors.amount ?? fieldError("amount")} onChange={(value) => change("amount", value)}
      />
      <ChoiceGroup
        label={t("payer")} value={values.payer_id} required disabled={isPending} variant="chips"
        error={errors.payer_id ?? fieldError("payer_id")}
        options={members.map((member) => ({ value: member.user_id, label: member.nickname }))}
        onChange={(value) => {
          change("payer_id", value)
          setSync((current) => syncAfterPayerChange(current, value, currentUserId))
        }}
      />
      <ChoiceGroup
        label={t("splitMode")} value={values.split_mode} disabled={isPending}
        options={SPLIT_MODES.map((mode) => ({ value: mode, label: t(mode) }))}
        onChange={(value) => change("split_mode", value as SplitMode)}
      />
      {values.split_mode === "equal" ? (
        <EqualShares
          values={values} members={members} disabled={isPending}
          error={errors.participant_ids ?? fieldError("participant_ids")}
          onChange={(ids) => change("participant_ids", ids)}
        />
      ) : (
        <CustomShares
          values={values} members={members} disabled={isPending}
          error={errors.shares ?? fieldError("shares")}
          onChange={(rows) => change("shares", rows)}
        />
      )}
      <TextInput
        label={t("entryDate")} type="date" value={values.entry_date} required disabled={isPending}
        error={errors.entry_date ?? fieldError("entry_date")}
        onChange={(value) => change("entry_date", value)}
      />
      <TextInput
        label={t("note")} value={values.note} disabled={isPending}
        error={errors.note ?? fieldError("note")} onChange={(value) => change("note", value)}
      />
      {/* 選填的附加動作, 放在旅遊帳本身的欄位之後。 */}
      {syncable && (
        <ExpenseSyncFields
          walletId={walletId} value={sync} disabled={isPending}
          error={syncErrors.category_id ?? fieldError("sync_to")}
          onChange={(value) => {
            setSync(value)
            setSyncErrors({})
          }}
        />
      )}
    </FormDialog>
  )
}
