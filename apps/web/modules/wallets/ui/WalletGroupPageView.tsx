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

type WalletGroupPageViewProps =
  | { group: WalletGroupInfo; wallets: WalletInfo[]; errorMessage: "" }
  | { group?: undefined; wallets?: undefined; errorMessage: string }

/** 一個錢包群組的頁面 (見 docs/features.md〈錢包列表〉)。載入失敗時只有錯誤訊息。 */
export default function WalletGroupPageView(
  { group, wallets, errorMessage }: WalletGroupPageViewProps,
) {
  const t = useT(walletsMessages)
  const groupLabel = useGroupLabel()
  const [creating, setCreating] = useState(false)
  const { notify, notifyError, closeNotify } = useNotify()
  const openCreate = () => setCreating(true)
  useActiveWalletKind(group?.kind ?? null)

  return (
    <Container size="lg" padded>
      <PageHeader
        title={group ? groupLabel(group) : t("pageTitle")}
        actions={<Button icon={<Plus size={ICON_SIZE.sm} />} onClick={openCreate}>{t("create")}</Button>}
        mobileActions={[{ icon: <Plus size={ICON_SIZE.sm} />, label: t("create"), onClick: openCreate }]}
      />
      <div className={styles.content}>
        {errorMessage && <ErrorState>{errorMessage}</ErrorState>}
        {group && <GroupBody group={group} wallets={wallets} />}
      </div>

      {/* 新的錢包放進預設群組; 建立後直接進到錢包頁。 */}
      <CreateWalletDialog
        key={group?.kind ?? "general"} open={creating} defaultKind={group?.kind ?? "general"}
        onClose={() => setCreating(false)} onError={notifyError}
      />
      <Notify {...notify} onOpenChange={(open) => { if (!open) closeNotify() }} />
    </Container>
  )
}

/** 一般群組的總額卡片與顯示中的錢包; 旅遊群組沒有總額。 */
function GroupBody({ group, wallets }: { group: WalletGroupInfo; wallets: WalletInfo[] }) {
  const t = useT(walletsMessages)
  return (
    <>
      {group.total_balance !== null && (
        <section className={styles.totalCard}>
          <span className={styles.totalLabel}>{t("totalBalance")}</span>
          <Amount value={group.total_balance} className={styles.totalValue} />
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
  // 群組只放一種類型, 一般錢包不再標類型; 旅遊錢包標目的地與日期。
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
