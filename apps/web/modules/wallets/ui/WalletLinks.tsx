"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { ICON_SIZE } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { walletSections } from "../capabilities"
import { walletsMessages } from "../i18n"
import {
  type WalletArea, walletCategoriesPath, walletHistoryPath, walletMembersPath, walletSettingsPath,
} from "../paths"
import type { WalletInfo } from "../types"
import styles from "./wallets.module.css"

/** 桌機錢包頁上其他頁的入口; 手機收進 ⋮ 選單。分類只屬於一般錢包, 設定只給管理者。 */
export default function WalletLinks({ wallet, area }: { wallet: WalletInfo; area: WalletArea }) {
  const t = useT(walletsMessages)
  const sections = walletSections(wallet)
  const links = [
    { href: walletMembersPath(wallet.id, area), title: t("members"), desc: t("membersDesc"), show: sections.members },
    {
      href: walletCategoriesPath(wallet.id, area), title: t("categories"), desc: t("categoriesDesc"),
      show: sections.categories,
    },
    {
      href: walletHistoryPath(wallet.id, area), title: t("history"), desc: t("historyDesc"),
      show: sections.history,
    },
    {
      href: walletSettingsPath(wallet.id, area), title: t("settings"),
      desc: wallet.kind === "travel" ? t("travelSettingsDesc") : t("settingsDesc"), show: sections.settings,
    },
  ].filter((link) => link.show)

  return (
    <ul className={`${styles.list} ${styles.desktopOnly}`}>
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
  )
}
