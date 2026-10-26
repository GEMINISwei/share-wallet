"use client"

import { type FormEvent, useState } from "react"
import { FormDialog, TextInput, useActionSubmit } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { createWalletGroup, renameWalletGroup } from "../actions"
import { walletsMessages } from "../i18n"
import type { WalletGroupInfo, WalletKind } from "../types"

type GroupDialogProps = {
  /** 有值是改名, 沒有是在 `kind` 底下新增。類型建立後不能改, 所以不給選。 */
  group: WalletGroupInfo | null
  kind: WalletKind
  open: boolean
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (message: string) => void
}

export default function GroupDialog({
  group, kind, open, onClose, onSuccess, onError,
}: GroupDialogProps) {
  const t = useT(walletsMessages)
  const [name, setName] = useState(group?.name ?? "")
  const [nameError, setNameError] = useState<string>()
  const { isPending, submit, fieldError } = useActionSubmit()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim()) {
      setNameError(t("nameRequired"))
      return
    }
    const run = group
      ? () => renameWalletGroup(group.id, name.trim())
      : () => createWalletGroup({ kind, name: name.trim() })
    submit(run, {
      onSuccess: () => onSuccess(group ? t("groupRenamed") : t("groupCreated")),
      onError,
      errorFallback: t("groupFailed"),
    })
  }

  return (
    <FormDialog
      title={group ? t("renameGroup") : t("addGroup")} open={open} isPending={isPending}
      submitText={t("save")} pendingText={t("saving")} onClose={onClose} onSubmit={handleSubmit}
    >
      <TextInput
        label={t("groupName")} value={name} required disabled={isPending} autoFocus
        error={nameError ?? fieldError("name")}
        onChange={(value) => { setName(value); setNameError(undefined) }}
      />
    </FormDialog>
  )
}
