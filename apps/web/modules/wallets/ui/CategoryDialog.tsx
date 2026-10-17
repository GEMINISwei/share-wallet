"use client"

import { type FormEvent, useState } from "react"
import { FormDialog, SelectInput, TextInput, useActionSubmit } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { createCategory, renameCategory } from "../actions"
import { walletsMessages } from "../i18n"
import type { CategoryInfo, CategoryType } from "../types"

type CategoryDialogProps = {
  walletId: string
  /** 有值是改名, 沒有是新增。 */
  category: CategoryInfo | null
  defaultType: CategoryType
  open: boolean
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (message: string) => void
}

export default function CategoryDialog({
  walletId, category, defaultType, open, onClose, onSuccess, onError,
}: CategoryDialogProps) {
  const t = useT(walletsMessages)
  const [name, setName] = useState(category?.name ?? "")
  const [type, setType] = useState<CategoryType>(category?.type ?? defaultType)
  const [nameError, setNameError] = useState<string>()
  const { isPending, submit, fieldError } = useActionSubmit()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim()) {
      setNameError(t("nameRequired"))
      return
    }
    const run = category
      ? () => renameCategory(walletId, category.id, name.trim())
      : () => createCategory(walletId, { type, name: name.trim() })
    submit(run, {
      onSuccess: () => onSuccess(category ? t("categoryRenamed") : t("categoryCreated")),
      onError,
      errorFallback: t("categoryFailed"),
    })
  }

  return (
    <FormDialog
      title={category ? t("renameCategory") : t("addCategory")} open={open} isPending={isPending}
      submitText={t("save")} pendingText={t("saving")} onClose={onClose} onSubmit={handleSubmit}
    >
      {/* 類型建立後不能改, 所以只有新增時能選。 */}
      {!category && (
        <SelectInput
          label={t("categoryType")} value={type} disabled={isPending}
          options={[{ value: "expense", label: t("expense") }, { value: "income", label: t("income") }]}
          onChange={(value) => setType(value as CategoryType)}
        />
      )}
      <TextInput
        label={t("categoryName")} value={name} required disabled={isPending} autoFocus
        error={nameError ?? fieldError("name")}
        onChange={(value) => { setName(value); setNameError(undefined) }}
      />
    </FormDialog>
  )
}
