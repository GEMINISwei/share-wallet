"use client"

import { useRouter } from "next/navigation"
import type { FormEvent } from "react"
import { FormDialog, useActionSubmit } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { createWallet } from "../actions"
import { walletsMessages } from "../i18n"
import { walletPath } from "../paths"
import type { WalletFormValues, WalletKind } from "../types"
import { toCreateRequest } from "../validation"
import { useWalletForm } from "./useWalletForm"
import WalletFields from "./WalletFields"
import styles from "./wallets.module.css"

const EMPTY: WalletFormValues = {
  kind: "general", name: "", initial_balance: "", destination: "", start_date: "", end_date: "",
}

type CreateWalletDialogProps = {
  open: boolean
  onClose: () => void
  onError: (message: string) => void
}

export default function CreateWalletDialog({ open, onClose, onError }: CreateWalletDialogProps) {
  const t = useT(walletsMessages)
  const router = useRouter()
  const form = useWalletForm(EMPTY)
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

  const kinds: { value: WalletKind; title: string; desc: string }[] = [
    { value: "general", title: t("kindGeneral"), desc: t("kindGeneralDesc") },
    { value: "travel", title: t("kindTravel"), desc: t("kindTravelDesc") },
  ]

  return (
    <FormDialog
      title={t("create")} open={open} isPending={isPending} submitText={t("createSubmit")}
      pendingText={t("createPending")} onClose={handleClose} onSubmit={handleSubmit}
    >
      <div className={styles.kindOptions} role="radiogroup" aria-label={t("kind")}>
        {kinds.map((kind) => {
          const selected = form.values.kind === kind.value
          return (
            <button
              key={kind.value} type="button" role="radio" aria-checked={selected}
              className={[styles.kindOption, selected && styles.kindOptionSelected].filter(Boolean).join(" ")}
              disabled={isPending} onClick={() => form.change("kind", kind.value)}
            >
              <span className={styles.kindOptionTitle}>{kind.title}</span>
              <span className={styles.kindOptionDesc}>{kind.desc}</span>
            </button>
          )
        })}
      </div>
      <WalletFields
        values={form.values}
        errors={{ ...form.errors, name: form.errors.name ?? fieldError("name") }}
        disabled={isPending} showInitialBalance onChange={form.change}
      />
    </FormDialog>
  )
}
