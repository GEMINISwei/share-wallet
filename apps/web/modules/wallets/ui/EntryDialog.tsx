"use client"

import { type FormEvent, useState } from "react"
import { FormDialog, SelectInput, TextInput, useActionSubmit } from "@/shared/ui"
import { useLocale, useT } from "@/shared/i18n/context"
import { createEntry, updateEntry } from "../actions"
import { entryCategoryOptions } from "../capabilities"
import { localToday } from "../format"
import { walletsMessages } from "../i18n"
import type { CategoryInfo, EntryFormErrors, EntryFormValues, EntryInfo } from "../types"
import { hasErrors, toEntryRequest, validateEntryForm } from "../validation"

type EntryDialogProps = {
  walletId: string
  /** 有值是修改 (只會是收入或支出), 沒有是記一筆。 */
  entry: EntryInfo | null
  categories: CategoryInfo[]
  open: boolean
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (message: string) => void
}

function initialValues(entry: EntryInfo | null): EntryFormValues {
  if (!entry || entry.kind === "adjustment") {
    return { kind: "expense", amount: "", category_id: "", entry_date: localToday(), note: "" }
  }
  return {
    kind: entry.kind,
    amount: String(entry.amount),
    category_id: entry.category?.id ?? "",
    entry_date: entry.entry_date,
    note: entry.note,
  }
}

export default function EntryDialog({
  walletId, entry, categories, open, onClose, onSuccess, onError,
}: EntryDialogProps) {
  const t = useT(walletsMessages)
  const locale = useLocale()
  const [values, setValues] = useState(() => initialValues(entry))
  const [errors, setErrors] = useState<EntryFormErrors>({})
  const { isPending, submit, fieldError } = useActionSubmit()
  const options = entryCategoryOptions(categories, values.kind, entry)

  function change(field: keyof EntryFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function changeKind(kind: EntryFormValues["kind"]) {
    // 分類有類型, 換了收支原本選的分類就不能用了。
    setValues((current) => ({ ...current, kind, category_id: "" }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found = validateEntryForm(values, locale)
    setErrors(found)
    if (hasErrors(found)) return
    const data = toEntryRequest(values)
    const run = entry
      ? () => updateEntry(walletId, entry.id, data)
      : () => createEntry(walletId, data)
    submit(run, {
      onSuccess: () => onSuccess(entry ? t("entryUpdated") : t("entryCreated")),
      onError,
      errorFallback: t("entryFailed"),
    })
  }

  return (
    <FormDialog
      title={entry ? t("editEntry") : t("addEntry")} open={open} isPending={isPending}
      submitText={t("save")} pendingText={t("saving")} onClose={onClose} onSubmit={handleSubmit}
    >
      <SelectInput
        label={t("entryKind")} value={values.kind} disabled={isPending}
        options={[{ value: "expense", label: t("expense") }, { value: "income", label: t("income") }]}
        onChange={(value) => changeKind(value as EntryFormValues["kind"])}
      />
      <TextInput
        label={t("amount")} value={values.amount} required disabled={isPending} autoFocus
        error={errors.amount ?? fieldError("amount")} onChange={(value) => change("amount", value)}
      />
      <SelectInput
        label={t("category")} value={values.category_id} required disabled={isPending}
        error={errors.category_id ?? fieldError("category_id")}
        options={[
          { value: "", label: t("categoryPlaceholder") },
          ...options.map((option) => ({ value: option.id, label: option.name })),
        ]}
        onChange={(value) => change("category_id", value)}
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
