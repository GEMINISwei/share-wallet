"use client"

import Link from "next/link"
import { ChevronRight, Plane, Plus, Star, Wallet } from "lucide-react"
import { useState } from "react"
import {
  Button, Container, ErrorState, ICON_SIZE, Notify, PageHeader, useNotify,
} from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { walletsMessages } from "../i18n"
import { walletPath } from "../paths"
import type { WalletGroupInfo, WalletInfo, WalletKind } from "../types"
import Amount from "./Amount"
import CreateWalletDialog from "./CreateWalletDialog"
import { useActiveWalletKind } from "./WalletNav"
import { useGroupLabel } from "./useGroupLabel"
import WalletStatusBadge from "./WalletStatusBadge"
import styles from "./wallets.module.css"

/** 一般錢包的一個群組, 或旅遊錢包頁 (旅遊錢包不分群組, 一頁列出全部)。 */
export type WalletListPage =
  | { kind: "general"; group: WalletGroupInfo; wallets: WalletInfo[] }
  | { kind: "travel"; wallets: WalletInfo[] }

type WalletGroupPageViewProps =
  | { page: WalletListPage; errorMessage: "" }
  | { page?: undefined; errorMessage: string }

/** 錢包列表的一頁 (見 docs/features/wallets.md〈錢包列表〉)。載入失敗時只有錯誤訊息。 */
export default function WalletGroupPageView({ page, errorMessage }: WalletGroupPageViewProps) {
  const t = useT(walletsMessages)
  const groupLabel = useGroupLabel()
  const [creating, setCreating] = useState(false)
  const { notify, notifyError, closeNotify } = useNotify()
  const openCreate = () => setCreating(true)
  useActiveWalletKind(page?.kind ?? null)
  const title = !page ? t("pageTitle")
    : page.kind === "travel" ? t("travelWallets") : groupLabel(page.group)

  return (
    <Container size="lg" padded>
      <PageHeader
        title={title}
        actions={<Button icon={<Plus size={ICON_SIZE.sm} />} onClick={openCreate}>{t("create")}</Button>}
        mobileActions={[{ icon: <Plus size={ICON_SIZE.sm} />, label: t("create"), onClick: openCreate }]}
      />
      <div className={styles.content}>
        {errorMessage && <ErrorState>{errorMessage}</ErrorState>}
        {page && <PageBody page={page} />}
      </div>

      {/* 新的一般錢包放進未分組; 建立後直接進到錢包頁。 */}
      <CreateWalletDialog
        key={page?.kind ?? "general"} open={creating} defaultKind={page?.kind ?? "general"}
        onClose={() => setCreating(false)} onError={notifyError}
      />
      <Notify {...notify} onOpenChange={(open) => { if (!open) closeNotify() }} />
    </Container>
  )
}

/** 一般群組的總額卡片與顯示中的錢包; 旅遊錢包沒有餘額, 不顯示總額。 */
function PageBody({ page }: { page: WalletListPage }) {
  const t = useT(walletsMessages)
  const { wallets } = page
  return (
    <>
      {page.kind === "general" && (
        <section className={styles.totalCard}>
          <span className={styles.totalLabel}>{t("totalBalance")}</span>
          <Amount value={page.group.total_balance} className={styles.totalValue} />
        </section>
      )}
      {wallets.length === 0 && <p className={styles.hint}>{t("emptyGroup")}</p>}
      {wallets.length > 0 && (
        <ul className={`${styles.list} ${styles.walletCards}`}>
          {wallets.map((wallet) => (
            <li key={wallet.id}>
              <WalletRow wallet={wallet} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function WalletRow({ wallet }: { wallet: WalletInfo }) {
  const t = useT(walletsMessages)
  // 一頁只有一種類型, 一般錢包不再標類型; 旅遊錢包標目的地與日期。
  const meta = wallet.kind === "travel"
    ? `${wallet.destination} · ${t("dateRange", { start: wallet.start_date ?? "", end: wallet.end_date ?? "" })}`
    : null
  return (
    <Link href={walletPath(wallet.id)} className={styles.row}>
      <WalletKindIcon kind={wallet.kind} />
      <span className={`${styles.rowMain} ${styles.rowGrow}`}>
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

// 一眼分出類型; 名稱旁邊已經有文字資訊, 圖示只是裝飾, 不另外念給螢幕閱讀器。
function WalletKindIcon({ kind }: { kind: WalletKind }) {
  const Icon = kind === "travel" ? Plane : Wallet
  return (
    <span className={`${styles.kindIcon} ${kind === "travel" ? styles.kindIconTravel : ""}`} aria-hidden="true">
      <Icon size={ICON_SIZE.md} />
    </span>
  )
}
