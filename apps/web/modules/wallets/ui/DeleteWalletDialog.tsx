"use client"

import { useRouter } from "next/navigation"
import { type FormEvent, useState } from "react"
import { FormDialog, TextInput, useActionSubmit } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { deleteWallet } from "../actions"
import { walletsMessages } from "../i18n"
import { WALLETS_PATH } from "../manifest"
import type { WalletInfo } from "../types"
import { canConfirmDelete } from "../validation"
import styles from "./wallets.module.css"

type DeleteWalletDialogProps = {
  wallet: WalletInfo
  open: boolean
  onClose: () => void
  onError: (message: string) => void
}

// 刪除是永久的, 所以要輸入一樣的名稱才送得出去 (見 docs/features.md〈刪除錢包〉)。
export default function DeleteWalletDialog({
  wallet, open, onClose, onError,
}: DeleteWalletDialogProps) {
  const t = useT(walletsMessages)
  const router = useRouter()
  const [input, setInput] = useState("")
  const { isPending, submit } = useActionSubmit()

  function handleClose() {
    setInput("")
    onClose()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canConfirmDelete(input, wallet.name)) return
    submit(() => deleteWallet(wallet.id), {
      onSuccess: () => router.push(WALLETS_PATH),
      onError,
      errorFallback: t("deleteFailed"),
    })
  }

  return (
    <FormDialog
      title={t("deleteConfirmTitle", { name: wallet.name })} open={open} isPending={isPending}
      submitText={t("deleteSubmit")} pendingText={t("deletePending")}
      onClose={handleClose} onSubmit={handleSubmit}
    >
      <p className={styles.hint}>{t("deleteDesc")}</p>
      <TextInput
        label={t("deleteConfirmHint")} value={input} placeholder={wallet.name}
        disabled={isPending} autoFocus onChange={setInput}
      />
    </FormDialog>
  )
}
