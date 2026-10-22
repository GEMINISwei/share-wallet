"use client"

import Link from "next/link"
import { ChevronRight, Plus, Star } from "lucide-react"
import { useState } from "react"
import {
  Button, Container, ErrorState, ICON_SIZE, LinkTabs, Notify, PageHeader, useNotify,
} from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { walletsOfTab } from "../capabilities"
import { walletsMessages } from "../i18n"
import { walletPath, walletsListPath } from "../paths"
import type { WalletInfo, WalletKind } from "../types"
import Amount from "./Amount"
import CreateWalletDialog from "./CreateWalletDialog"
import WalletStatusBadge from "./WalletStatusBadge"
import styles from "./wallets.module.css"

type WalletsViewProps = {
  tab: WalletKind
  wallets: WalletInfo[]
  totalBalance: number
  errorMessage: string
}

/** 錢包列表依類型分成兩個分頁 (見 docs/features.md〈錢包列表〉)。 */
export default function WalletsView(
  { tab, wallets, totalBalance, errorMessage }: WalletsViewProps,
) {
  const t = useT(walletsMessages)
  const [creating, setCreating] = useState(false)
  const { notify, notifyError, closeNotify } = useNotify()
  const openCreate = () => setCreating(true)
  const shown = walletsOfTab(wallets, tab)
  const tabs = [
    { href: walletsListPath("user", "general"), label: t("tabGeneral"), active: tab === "general" },
    { href: walletsListPath("user", "travel"), label: t("tabTravel"), active: tab === "travel" },
  ]

  return (
    <Container size="lg" padded>
      <PageHeader
        title={t("heading")}
        actions={<Button icon={<Plus size={ICON_SIZE.sm} />} onClick={openCreate}>{t("create")}</Button>}
        mobileActions={[{ icon: <Plus size={ICON_SIZE.sm} />, label: t("create"), onClick: openCreate }]}
      />
      <div className={styles.content}>
        <LinkTabs tabs={tabs} label={t("listTabs")} />
        {tab === "general" && (
          <section className={styles.summary}>
            <span className={styles.summaryLabel}>{t("totalBalance")}</span>
            <Amount value={totalBalance} className={styles.summaryValue} />
          </section>
        )}

        {errorMessage && <ErrorState>{errorMessage}</ErrorState>}
        {!errorMessage && shown.length === 0 && (
          <p className={styles.hint}>{tab === "travel" ? t("emptyTravel") : t("empty")}</p>
        )}
        {shown.length > 0 && (
          <ul className={`${styles.list} ${styles.walletCards}`}>
            {shown.map((wallet) => (
              <li key={wallet.id}>
                <WalletRow wallet={wallet} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <CreateWalletDialog
        key={tab} open={creating} defaultKind={tab}
        onClose={() => setCreating(false)} onError={notifyError}
      />
      <Notify {...notify} onOpenChange={(open) => { if (!open) closeNotify() }} />
    </Container>
  )
}

function WalletRow({ wallet }: { wallet: WalletInfo }) {
  const t = useT(walletsMessages)
  // 已經在分頁裡分了類型, 一般錢包不再標類型; 旅遊錢包標目的地與日期。
  const meta = wallet.kind === "travel"
    ? `${wallet.destination} · ${t("dateRange", { start: wallet.start_date ?? "", end: wallet.end_date ?? "" })}`
    : null
  return (
    <Link href={walletPath(wallet.id)} className={styles.row}>
      <span className={styles.rowMain}>
        <span className={styles.rowTitleLine}>
          {wallet.is_favorite && (
            <Star
              size={ICON_SIZE.sm} fill="currentColor" className={styles.favoriteStar}
              aria-label={t("favorite")}
            />
          )}
          <span className={styles.rowTitle}>{wallet.name}</span>
        </span>
        {meta && <span className={styles.rowMeta}>{meta}</span>}
      </span>
      <span className={styles.rowEnd}>
        <WalletStatusBadge wallet={wallet} />
        {wallet.balance !== null && <Amount value={wallet.balance} />}
        <ChevronRight size={ICON_SIZE.sm} aria-hidden="true" />
      </span>
    </Link>
  )
}
