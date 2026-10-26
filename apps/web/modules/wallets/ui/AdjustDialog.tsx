"use client"

import { type FormEvent, useState } from "react"
import { FormDialog, TextInput, useActionSubmit } from "@/shared/ui"
import { useLocale, useT } from "@/shared/i18n/context"
import { adjustBalance } from "../actions"
import { formatAmount, localToday } from "../format"
import { walletsMessages } from "../i18n"
import type { AdjustFormErrors, AdjustFormValues } from "../types"
import { hasErrors, toAdjustRequest, validateAdjustForm } from "../validation"
import styles from "./wallets.module.css"

type AdjustDialogProps = {
  walletId: string
  balance: number
  open: boolean
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (message: string) => void
}

export default function AdjustDialog({
  walletId, balance, open, onClose, onSuccess, onError,
}: AdjustDialogProps) {
  const t = useT(walletsMessages)
  const locale = useLocale()
  const [values, setValues] = useState<AdjustFormValues>(
    () => ({ balance: String(balance), entry_date: localToday(), note: "" }),
  )
  const [errors, setErrors] = useState<AdjustFormErrors>({})
  const { isPending, submit, fieldError } = useActionSubmit()

  function change(field: keyof AdjustFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found = validateAdjustForm(values, locale)
    setErrors(found)
    if (hasErrors(found)) return
    submit(() => adjustBalance(walletId, toAdjustRequest(values)), {
      onSuccess: () => onSuccess(t("balanceAdjusted")),
      onError,
      errorFallback: t("entryFailed"),
    })
  }

  return (
    <FormDialog
      title={t("adjustBalance")} open={open} isPending={isPending}
      submitText={t("save")} pendingText={t("saving")} onClose={onClose} onSubmit={handleSubmit}
    >
      <p className={styles.hint}>
        {t("currentBalance", { amount: formatAmount(balance, locale) })}
        <br />
        {t("adjustHint")}
      </p>
      <TextInput
        label={t("actualBalance")} value={values.balance} required disabled={isPending} autoFocus
        error={errors.balance ?? fieldError("balance")} onChange={(value) => change("balance", value)}
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
