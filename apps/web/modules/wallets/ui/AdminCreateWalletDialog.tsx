"use client"

import { useRouter } from "next/navigation"
import { type FormEvent, useState } from "react"
import { FormDialog, SelectInput, useActionSubmit } from "@/shared/ui"
import { useLocale, useT } from "@/shared/i18n/context"
import { createWalletForUser } from "../actions"
import { walletsMessages } from "../i18n"
import { walletPath } from "../paths"
import type { UserOption } from "../types"
import { emptyWalletForm, toAdminCreateRequest, validateAdminUser } from "../validation"
import KindOptions from "./KindOptions"
import { useWalletForm } from "./useWalletForm"
import WalletFields from "./WalletFields"
import styles from "./wallets.module.css"

type AdminCreateWalletDialogProps = {
  open: boolean
  users: UserOption[]
  onClose: () => void
  onError: (message: string) => void
}

/** 後台建立錢包: 跟使用者區一樣的欄位, 多一個指定管理者。 */
export default function AdminCreateWalletDialog({
  open, users, onClose, onError,
}: AdminCreateWalletDialogProps) {
  const t = useT(walletsMessages)
  const locale = useLocale()
  const router = useRouter()
  const form = useWalletForm(emptyWalletForm())
  const [adminUserId, setAdminUserId] = useState("")
  const [adminError, setAdminError] = useState<string>()
  const { isPending, submit, fieldError } = useActionSubmit()

  function handleClose() {
    form.reset()
    setAdminUserId("")
    setAdminError(undefined)
    onClose()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formValid = form.validate()
    const nextAdminError = validateAdminUser(adminUserId, locale)
    setAdminError(nextAdminError)
    if (!formValid || nextAdminError) return
    let createdId = ""
    submit(
      async () => {
        const res = await createWalletForUser(toAdminCreateRequest(form.values, adminUserId))
        if (res.status === "success") createdId = res.data.id
        return res
      },
      {
        onSuccess: () => router.push(walletPath(createdId, "admin")),
        onError,
        errorFallback: t("createFailed"),
      },
    )
  }

  const userOptions = [
    { value: "", label: t("adminUserPlaceholder") },
    ...users.map((user) => ({ value: user.id, label: `${user.nickname} (${user.username})` })),
  ]

  return (
    <FormDialog
      title={t("create")} open={open} isPending={isPending} submitText={t("createSubmit")}
      pendingText={t("createPending")} onClose={handleClose} onSubmit={handleSubmit}
    >
      <KindOptions
        value={form.values.kind} disabled={isPending} onChange={(kind) => form.change("kind", kind)}
      />
      <SelectInput
        label={t("adminUser")} value={adminUserId} options={userOptions} required
        disabled={isPending} error={adminError ?? fieldError("admin_user_id")}
        onChange={(value) => {
          setAdminUserId(value)
          setAdminError(undefined)
        }}
      />
      <p className={styles.hint}>{t("adminUserHint")}</p>
      <WalletFields
        values={form.values}
        errors={{ ...form.errors, name: form.errors.name ?? fieldError("name") }}
        disabled={isPending} showInitialBalance onChange={form.change}
      />
    </FormDialog>
  )
}
