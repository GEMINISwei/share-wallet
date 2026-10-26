"use client"

import { useRouter } from "next/navigation"
import type { FormEvent } from "react"
import { FormDialog, useActionSubmit } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { createWallet } from "../actions"
import { walletsMessages } from "../i18n"
import { walletPath } from "../paths"
import type { WalletKind } from "../types"
import { emptyWalletForm, toCreateRequest } from "../validation"
import KindOptions from "./KindOptions"
import { useWalletForm } from "./useWalletForm"
import WalletFields from "./WalletFields"

type CreateWalletDialogProps = {
  open: boolean
  /** 預設的類型。表單只在掛上時讀一次, 要跟著分頁變時由呼叫端換 `key`。 */
  defaultKind: WalletKind
  onClose: () => void
  onError: (message: string) => void
}

export default function CreateWalletDialog(
  { open, defaultKind, onClose, onError }: CreateWalletDialogProps,
) {
  const t = useT(walletsMessages)
  const router = useRouter()
  const form = useWalletForm(emptyWalletForm(defaultKind))
  const { isPending, submit, fieldError } = useActionSubmit()

  function handleClose() {
    form.reset()
    onClose()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.validate()) return
    let createdId = ""
    submit(
      async () => {
        const res = await createWallet(toCreateRequest(form.values))
        if (res.status === "success") createdId = res.data.id
        return res
      },
      { onSuccess: () => router.push(walletPath(createdId)), onError, errorFallback: t("createFailed") },
    )
  }

  return (
    <FormDialog
      title={t("create")} open={open} isPending={isPending} submitText={t("createSubmit")}
      pendingText={t("createPending")} onClose={handleClose} onSubmit={handleSubmit}
    >
      <KindOptions
        value={form.values.kind} disabled={isPending} onChange={(kind) => form.change("kind", kind)}
      />
      <WalletFields
        values={form.values}
        errors={{ ...form.errors, name: form.errors.name ?? fieldError("name") }}
        disabled={isPending} showInitialBalance onChange={form.change}
      />
    </FormDialog>
  )
}
