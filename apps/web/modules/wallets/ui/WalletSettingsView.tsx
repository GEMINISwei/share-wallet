"use client"

import { useRouter } from "next/navigation"
import { type FormEvent, useState } from "react"
import { Button, Notify, useActionSubmit, useNotify } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { updateWallet } from "../actions"
import { isArchived } from "../capabilities"
import { walletsMessages } from "../i18n"
import { type WalletArea, walletPath } from "../paths"
import type { WalletInfo } from "../types"
import { toUpdateRequest } from "../validation"
import DeleteWalletDialog from "./DeleteWalletDialog"
import { useWalletForm } from "./useWalletForm"
import WalletFields from "./WalletFields"
import WalletShell from "./WalletShell"
import styles from "./wallets.module.css"

type WalletSettingsViewProps = { wallet: WalletInfo; area: WalletArea }

export default function WalletSettingsView({ wallet, area }: WalletSettingsViewProps) {
  const t = useT(walletsMessages)
  const router = useRouter()
  const form = useWalletForm({
    kind: wallet.kind,
    name: wallet.name,
    initial_balance: "",
    destination: wallet.destination ?? "",
    start_date: wallet.start_date ?? "",
    end_date: wallet.end_date ?? "",
  })
  const [deleting, setDeleting] = useState(false)
  const { isPending, submit, fieldError } = useActionSubmit()
  const { notify, notifyError, notifySuccess, closeNotify } = useNotify()
  // 已結帳的錢包只能查看, 設定頁只剩刪除 (見 docs/features/travel-wallet.md〈封存〉)。
  const locked = isPending || isArchived(wallet)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.validate()) return
    submit(() => updateWallet(wallet.id, toUpdateRequest(form.values)), {
      onSuccess: () => {
        notifySuccess(t("saved"))
        router.refresh()
      },
      onError: notifyError,
      errorFallback: t("saveFailed"),
    })
  }

  return (
    <WalletShell
      title={t("settings")} subtitle={wallet.name}
      backHref={walletPath(wallet.id, area)} backLabel={t("backToWallet")}
    >
      <form className={styles.panel} onSubmit={handleSubmit} noValidate>
        {isArchived(wallet) && <p className={styles.hint}>{t("settingsArchivedHint")}</p>}
        <WalletFields
          values={form.values}
          errors={{ ...form.errors, name: form.errors.name ?? fieldError("name") }}
          disabled={locked} showInitialBalance={false} onChange={form.change}
        />
        <div>
          <Button type="submit" disabled={locked}>{isPending ? t("saving") : t("save")}</Button>
        </div>
      </form>

      <section className={`${styles.panel} ${styles.dangerPanel}`}>
        <h2 className={styles.sectionTitle}>{t("dangerZone")}</h2>
        <p className={styles.hint}>{t("deleteDesc")}</p>
        <div>
          <Button variant="outlined" onClick={() => setDeleting(true)}>{t("deleteWallet")}</Button>
        </div>
      </section>

      <DeleteWalletDialog
        wallet={wallet} area={area} open={deleting}
        onClose={() => setDeleting(false)} onError={notifyError}
      />
      <Notify {...notify} onOpenChange={(open) => { if (!open) closeNotify() }} />
    </WalletShell>
  )
}
