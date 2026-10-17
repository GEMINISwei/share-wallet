"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { ICON_SIZE } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { walletSections } from "../capabilities"
import { walletsMessages } from "../i18n"
import { WALLETS_PATH } from "../manifest"
import { walletCategoriesPath, walletMembersPath, walletSettingsPath } from "../paths"
import type { WalletInfo } from "../types"
import Amount from "./Amount"
import WalletShell from "./WalletShell"
import styles from "./wallets.module.css"

export default function WalletView({ wallet }: { wallet: WalletInfo }) {
  const t = useT(walletsMessages)
  const sections = walletSections(wallet)
  const isTravel = wallet.kind === "travel"
  const subtitle = isTravel
    ? `${wallet.destination} · ${t("dateRange", { start: wallet.start_date ?? "", end: wallet.end_date ?? "" })}`
    : t("kindGeneral")
  const links = [
    { href: walletMembersPath(wallet.id), title: t("members"), desc: t("membersDesc"), show: sections.members },
    {
      href: walletCategoriesPath(wallet.id), title: t("categories"), desc: t("categoriesDesc"),
      show: sections.categories,
    },
    {
      href: walletSettingsPath(wallet.id), title: t("settings"),
      desc: isTravel ? t("travelSettingsDesc") : t("settingsDesc"), show: sections.settings,
    },
  ].filter((link) => link.show)

  return (
    <WalletShell title={wallet.name} subtitle={subtitle} backHref={WALLETS_PATH} backLabel={t("backToList")}>
      {wallet.balance !== null && (
        <section className={styles.summary}>
          <span className={styles.summaryLabel}>{t("balance")}</span>
          <Amount value={wallet.balance} className={styles.summaryValue} />
        </section>
      )}
      <p className={styles.hint}>{t("ledgerComingSoon")}</p>
      <ul className={styles.list}>
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className={styles.row}>
              <span className={styles.rowMain}>
                <span className={styles.rowTitle}>{link.title}</span>
                <span className={styles.rowMeta}>{link.desc}</span>
              </span>
              <ChevronRight size={ICON_SIZE.sm} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </WalletShell>
  )
}
