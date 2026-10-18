"use client"

import { type FormEvent, useState } from "react"
import { FormDialog, TextInput, useActionSubmit } from "@/shared/ui"
import { useLocale, useT } from "@/shared/i18n/context"
import { createRepayment, updateRepayment } from "../actions"
import { formatAmount, localToday } from "../format"
import { walletsMessages } from "../i18n"
import type { EntryInfo, RepayFormErrors, RepayFormValues } from "../types"
import { hasErrors, toMoneyRequest, validateRepayForm } from "../validation"
import styles from "./wallets.module.css"

/** 對著一筆代墊記還款, 或修改一筆還款。兩者都不能換對象或換到另一筆代墊。 */
export type RepaymentTarget =
  | { kind: "create"; advance: EntryInfo }
  | { kind: "edit"; repayment: EntryInfo }

type RepaymentDialogProps = {
  walletId: string
  target: RepaymentTarget
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (message: string) => void
}

function initialValues(target: RepaymentTarget): RepayFormValues {
  if (target.kind === "create") return { amount: "", entry_date: localToday(), note: "" }
  const { repayment } = target
  const { amount, entry_date, note } = repayment
  return { amount: String(amount), entry_date, note }
}

function saveAction(walletId: string, target: RepaymentTarget, values: RepayFormValues) {
  const data = toMoneyRequest(values)
  return target.kind === "create"
    ? () => createRepayment(walletId, target.advance.id, data)
    : () => updateRepayment(walletId, target.repayment.id, data)
}

export default function RepaymentDialog({
  walletId, target, onClose, onSuccess, onError,
}: RepaymentDialogProps) {
  const t = useT(walletsMessages)
  const locale = useLocale()
  const [values, setValues] = useState(() => initialValues(target))
  const [errors, setErrors] = useState<RepayFormErrors>({})
  const { isPending, submit, fieldError } = useActionSubmit()
  const entry = target.kind === "create" ? target.advance : target.repayment
  // 修改時畫面上沒有代墊目前的未還, 上限交給後端 (見 `validateRepayForm`)。
  const max = target.kind === "create" ? target.advance.outstanding ?? 0 : null

  function change(field: keyof RepayFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found = validateRepayForm(values, max, locale)
    setErrors(found)
    if (hasErrors(found)) return
    submit(saveAction(walletId, target, values), {
      onSuccess: () => onSuccess(target.kind === "create" ? t("repaymentCreated") : t("entryUpdated")),
      onError,
      errorFallback: t("entryFailed"),
    })
  }

  return (
    <FormDialog
      title={target.kind === "create"
        ? t("repayTitle", { name: entry.advance_target_name ?? "" })
        : t("editRepayment")}
      open isPending={isPending}
      submitText={t("save")} pendingText={t("saving")} onClose={onClose} onSubmit={handleSubmit}
    >
      {max !== null && (
        <p className={styles.hint}>{t("outstandingAmount", { amount: formatAmount(max, locale) })}</p>
      )}
      <TextInput
        label={t("amount")} value={values.amount} required disabled={isPending} autoFocus
        error={errors.amount ?? fieldError("amount")} onChange={(value) => change("amount", value)}
      />
      <TextInput
        label={t("entryDate")} type="date" value={values.entry_date} required disabled={isPending}
        error={errors.entry_date ?? fieldError("entry_date")}
        onChange={(value) => change("entry_date", value)}
      />
      <TextInput
        label={t("note")} value={values.note} disabled={isPending}
        error={errors.note ?? fieldError("note")} onChange={(value) => change("note", value)}
      />
    </FormDialog>
  )
}
