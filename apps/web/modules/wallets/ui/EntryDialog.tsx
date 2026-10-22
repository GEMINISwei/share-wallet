"use client"

import { type FormEvent, useState } from "react"
import { ChoiceGroup, FormDialog, SelectInput, TextInput, useActionSubmit } from "@/shared/ui"
import { useLocale, useT } from "@/shared/i18n/context"
import {
  createAdvance, createEntry, createTransfer, updateAdvance, updateEntry, updateTransfer,
} from "../actions"
import { entryCategoryOptions, entryKindOptions, isTransfer } from "../capabilities"
import { localToday } from "../format"
import { walletsMessages } from "../i18n"
import type {
  CategoryInfo, EntryFormErrors, EntryFormValues, EntryInfo, TransferTarget,
} from "../types"
import {
  hasErrors, toAdvanceRequest, toEntryRequest, toMoneyRequest, toTransferRequest,
  toTransferUpdateRequest, validateEntryForm,
} from "../validation"

type EntryDialogProps = {
  walletId: string
  /** 標題下方顯示記在哪個錢包: 從別頁按「＋」選了錢包進來時, 再確認一次。 */
  walletName: string
  /** 有值是修改 (收支、轉帳或代墊; 調整與還款不從這裡改), 沒有是記一筆。 */
  entry: EntryInfo | null
  categories: CategoryInfo[]
  /** 代墊對象的輸入提示: 這個錢包用過的名字。 */
  targetNames: string[]
  transferTargets: TransferTarget[]
  /** 能不能建立轉帳 (見 `canTransfer`)。 */
  transferable: boolean
  open: boolean
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (message: string) => void
}

function initialValues(entry: EntryInfo | null): EntryFormValues {
  const blank = { amount: "", category_id: "", counterpart_wallet_id: "", target_name: "", note: "" }
  if (!entry || entry.kind === "adjustment" || entry.kind === "repayment") {
    return { ...blank, kind: "expense", entry_date: localToday() }
  }
  return {
    kind: entry.kind,
    amount: String(entry.amount),
    category_id: entry.category?.id ?? "",
    counterpart_wallet_id: entry.counterpart_wallet?.id ?? "",
    target_name: entry.advance_target_name ?? "",
    entry_date: entry.entry_date,
    note: entry.note,
  }
}

/** 收支、轉帳與代墊走不同的端點; 修改轉帳與代墊只送金額、日期、備註。 */
function saveAction(walletId: string, entry: EntryInfo | null, values: EntryFormValues) {
  const { kind } = values
  if (kind === "advance") {
    return entry
      ? () => updateAdvance(walletId, entry.id, toMoneyRequest(values))
      : () => createAdvance(walletId, toAdvanceRequest(values))
  }
  if (isTransfer(kind)) {
    return entry
      ? () => updateTransfer(walletId, entry.id, toTransferUpdateRequest(values))
      : () => createTransfer(walletId, toTransferRequest({ ...values, kind }))
  }
  const data = toEntryRequest({ ...values, kind })
  return entry ? () => updateEntry(walletId, entry.id, data) : () => createEntry(walletId, data)
}

export default function EntryDialog({
  walletId, walletName, entry, categories, targetNames, transferTargets, transferable, open,
  onClose, onSuccess, onError,
}: EntryDialogProps) {
  const t = useT(walletsMessages)
  const locale = useLocale()
  const [values, setValues] = useState(() => initialValues(entry))
  const [errors, setErrors] = useState<EntryFormErrors>({})
  const { isPending, submit, fieldError } = useActionSubmit()
  const kinds = entryKindOptions(entry, transferable)

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
    submit(saveAction(walletId, entry, values), {
      onSuccess: () => onSuccess(entry ? t("entryUpdated") : t("entryCreated")),
      onError,
      errorFallback: t("entryFailed"),
    })
  }

  return (
    <FormDialog
      title={entry ? t("editEntry") : t("addEntry")} subtitle={walletName} fullScreen open={open}
      isPending={isPending} submitText={t("save")} pendingText={t("saving")} onClose={onClose}
      onSubmit={handleSubmit}
    >
      <ChoiceGroup
        label={t("entryKind")} value={values.kind} disabled={isPending || kinds.length < 2}
        options={kinds.map((kind) => ({ value: kind, label: t(kind) }))}
        onChange={(value) => changeKind(value as EntryFormValues["kind"])}
      />
      <TextInput
        label={t("amount")} value={values.amount} required disabled={isPending} autoFocus
        size="display" inputMode="numeric" placeholder="0"
        error={errors.amount ?? fieldError("amount")} onChange={(value) => change("amount", value)}
      />
      {values.kind === "advance" ? (
        <TextInput
          label={t("advanceTarget")} value={values.target_name} required
          placeholder={t("advanceTargetHint")} suggestions={targetNames}
          // 代墊不能改對象, 打錯就刪掉重記 (見 docs/features.md〈代墊與還款〉)。
          disabled={isPending || entry !== null}
          error={errors.target_name ?? fieldError("target_name")}
          onChange={(value) => change("target_name", value)}
        />
      ) : isTransfer(values.kind) ? (
        <SelectInput
          label={t("counterpartWallet")} value={values.counterpart_wallet_id} required
          // 轉帳不能換對方錢包, 轉錯就刪掉重記 (見 docs/features.md〈轉帳〉)。
          disabled={isPending || entry !== null}
          error={errors.counterpart_wallet_id ?? fieldError("counterpart_wallet_id")}
          options={[
            { value: "", label: t("categoryPlaceholder") },
            ...(entry?.counterpart_wallet ? [entry.counterpart_wallet] : transferTargets)
              .map((target) => ({ value: target.id, label: target.name })),
          ]}
          onChange={(value) => change("counterpart_wallet_id", value)}
        />
      ) : (
        <ChoiceGroup
          label={t("category")} value={values.category_id} required disabled={isPending}
          variant="chips" error={errors.category_id ?? fieldError("category_id")}
          options={entryCategoryOptions(categories, values.kind, entry)
            .map((option) => ({ value: option.id, label: option.name }))}
          onChange={(value) => change("category_id", value)}
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
    </FormDialog>
  )
}
