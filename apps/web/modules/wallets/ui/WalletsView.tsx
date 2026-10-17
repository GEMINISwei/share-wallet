"use client"

import Link from "next/link"
import { ChevronRight, Plus } from "lucide-react"
import { useState } from "react"
import { Button, Container, ErrorState, ICON_SIZE, Notify, PageHeader, useNotify } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { walletsMessages } from "../i18n"
import { walletPath } from "../paths"
import type { WalletInfo } from "../types"
import Amount from "./Amount"
import CreateWalletDialog from "./CreateWalletDialog"
import styles from "./wallets.module.css"

type WalletsViewProps = {
  wallets: WalletInfo[]
  totalBalance: number
  errorMessage: string
}

export default function WalletsView({ wallets, totalBalance, errorMessage }: WalletsViewProps) {
  const t = useT(walletsMessages)
  const [creating, setCreating] = useState(false)
  const { notify, notifyError, closeNotify } = useNotify()
  const openCreate = () => setCreating(true)

  return (
    <Container size="lg" padded>
      <PageHeader
        title={t("heading")}
        actions={<Button icon={<Plus size={ICON_SIZE.sm} />} onClick={openCreate}>{t("create")}</Button>}
        mobileActions={[{ icon: <Plus size={ICON_SIZE.sm} />, label: t("create"), onClick: openCreate }]}
      />
      <div className={styles.content}>
        <section className={styles.summary}>
          <span className={styles.summaryLabel}>{t("totalBalance")}</span>
          <Amount value={totalBalance} className={styles.summaryValue} />
        </section>

        {errorMessage && <ErrorState>{errorMessage}</ErrorState>}
        {!errorMessage && wallets.length === 0 && <p className={styles.hint}>{t("empty")}</p>}
        {wallets.length > 0 && (
          <ul className={styles.list}>
            {wallets.map((wallet) => (
              <li key={wallet.id}>
                <WalletRow wallet={wallet} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <CreateWalletDialog
        open={creating} onClose={() => setCreating(false)} onError={notifyError}
      />
      <Notify {...notify} onOpenChange={(open) => { if (!open) closeNotify() }} />
    </Container>
  )
}

function WalletRow({ wallet }: { wallet: WalletInfo }) {
  const t = useT(walletsMessages)
  const meta = wallet.kind === "travel"
    ? `${wallet.destination} · ${t("dateRange", { start: wallet.start_date ?? "", end: wallet.end_date ?? "" })}`
    : t("kindGeneral")
  return (
    <Link href={walletPath(wallet.id)} className={styles.row}>
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{wallet.name}</span>
        <span className={styles.rowMeta}>{meta}</span>
      </span>
      <span className={styles.rowEnd}>
        {wallet.balance !== null && <Amount value={wallet.balance} />}
        <ChevronRight size={ICON_SIZE.sm} aria-hidden="true" />
      </span>
    </Link>
  )
}
