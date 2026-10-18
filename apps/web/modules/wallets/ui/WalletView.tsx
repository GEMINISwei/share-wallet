"use client"

import Link from "next/link"
import { ChevronRight, Plus, Scale } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button, ErrorState, ICON_SIZE, Notify, useNotify } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { walletSections } from "../capabilities"
import { walletsMessages } from "../i18n"
import {
  type WalletArea, walletCategoriesPath, walletHistoryPath, walletMembersPath, walletSettingsPath,
  walletsListPath,
} from "../paths"
import type { CategoryInfo, EntryPage, WalletInfo } from "../types"
import Amount from "./Amount"
import EntryList from "./EntryList"
import LedgerDialogs, { type LedgerDialog } from "./LedgerDialogs"
import WalletShell from "./WalletShell"
import styles from "./wallets.module.css"

/** 一般錢包才有的帳目資料; 旅遊錢包是 null。 */
export type WalletLedger = {
  entries: EntryPage
  categories: CategoryInfo[]
  currentUserId: string
  errorMessage: string
}

type WalletViewProps = { wallet: WalletInfo; area: WalletArea; ledger: WalletLedger | null }

export default function WalletView({ wallet, area, ledger }: WalletViewProps) {
  const t = useT(walletsMessages)
  const router = useRouter()
  const [dialog, setDialog] = useState<LedgerDialog>(null)
  // 每次寫入成功就換一個 key 讓列表重新掛載: 「載入更多」接上的頁不會跟著 refresh 更新。
  const [version, setVersion] = useState(0)
  const { notify, notifyError, notifySuccess, closeNotify } = useNotify()
  const isTravel = wallet.kind === "travel"
  const subtitle = isTravel
    ? `${wallet.destination} · ${t("dateRange", { start: wallet.start_date ?? "", end: wallet.end_date ?? "" })}`
    : t("kindGeneral")

  function handleSaved(message: string) {
    setDialog(null)
    setVersion((current) => current + 1)
    notifySuccess(message)
    router.refresh()
  }

  // 記帳的入口只放標題列 (手機收進 ⋮ 選單), 空的列表也不再放一顆。
  const addIcon = <Plus size={ICON_SIZE.sm} />
  const adjustIcon = <Scale size={ICON_SIZE.sm} />
  const openAdd = () => setDialog({ kind: "add" })
  const openAdjust = () => setDialog({ kind: "adjust" })

  return (
    <WalletShell
      title={wallet.name} subtitle={subtitle} backHref={walletsListPath(area)} backLabel={t("backToList")}
      actions={ledger && (
        <>
          <Button variant="outlined" icon={adjustIcon} onClick={openAdjust}>{t("adjustBalance")}</Button>
          <Button icon={addIcon} onClick={openAdd}>{t("addEntry")}</Button>
        </>
      )}
      mobileActions={ledger ? [
        { icon: addIcon, label: t("addEntry"), onClick: openAdd },
        { icon: adjustIcon, label: t("adjustBalance"), onClick: openAdjust },
      ] : undefined}
    >
      {wallet.balance !== null && (
        <section className={styles.summary}>
          <span className={styles.summaryLabel}>{t("balance")}</span>
          <Amount value={wallet.balance} className={styles.summaryValue} />
        </section>
      )}
      {isTravel && <p className={styles.hint}>{t("travelLedgerComingSoon")}</p>}
      {ledger && (
        <section>
          <h2 className={styles.sectionTitle}>{t("entries")}</h2>
          {ledger.errorMessage
            ? <ErrorState>{ledger.errorMessage}</ErrorState>
            : (
              <EntryList
                key={version} walletId={wallet.id} firstPage={ledger.entries}
                onOpen={(entry) => setDialog({ kind: "detail", entry })}
              />
            )}
        </section>
      )}
      <WalletLinks wallet={wallet} area={area} />
      {ledger && (
        <LedgerDialogs
          wallet={wallet} categories={ledger.categories} currentUserId={ledger.currentUserId}
          dialog={dialog} onChange={setDialog} onSaved={handleSaved} onError={notifyError}
        />
      )}
      <Notify {...notify} onOpenChange={(open) => { if (!open) closeNotify() }} />
    </WalletShell>
  )
}

/** 錢包底下其他頁的入口。分類與異動紀錄只屬於一般錢包, 設定只給管理者。 */
function WalletLinks({ wallet, area }: { wallet: WalletInfo; area: WalletArea }) {
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
  )
}
