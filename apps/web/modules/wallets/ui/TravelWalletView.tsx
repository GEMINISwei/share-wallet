"use client"

import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button, ErrorState, ICON_SIZE, Notify, useNotify } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { walletsMessages } from "../i18n"
import { type WalletArea, walletsListPath } from "../paths"
import type { ExpensePage, MemberInfo, NetBalanceInfo, WalletInfo } from "../types"
import ExpenseList from "./ExpenseList"
import NetBalanceList from "./NetBalanceList"
import TravelDialogs, { type TravelDialog } from "./TravelDialogs"
import WalletLinks from "./WalletLinks"
import WalletShell from "./WalletShell"
import styles from "./wallets.module.css"

/** 旅遊錢包頁的資料。 */
export type TravelLedger = {
  expenses: ExpensePage
  balances: NetBalanceInfo[]
  /** 加入錢包的順序, 記一筆時的付款人與分攤對象。 */
  members: MemberInfo[]
  currentUserId: string
  /** 帳目或成員載入失敗: 不顯示列表, 也不能記帳。 */
  errorMessage: string
  balancesFailed: boolean
}

type TravelWalletViewProps = { wallet: WalletInfo; area: WalletArea; travel: TravelLedger }

/** 旅遊錢包頁: 每人淨額、帳目列表, 以及成員、異動紀錄、設定的入口。 */
export default function TravelWalletView({ wallet, area, travel }: TravelWalletViewProps) {
  const t = useT(walletsMessages)
  const router = useRouter()
  const [dialog, setDialog] = useState<TravelDialog>(null)
  const { notify, notifyError, notifySuccess, closeNotify } = useNotify()
  const dates = t("dateRange", { start: wallet.start_date ?? "", end: wallet.end_date ?? "" })
  const ready = !travel.errorMessage

  function handleSaved(message: string) {
    setDialog(null)
    notifySuccess(message)
    router.refresh()
  }

  // 記帳的入口只放標題列 (手機收進 ⋮ 選單), 理由同一般錢包。
  const addIcon = <Plus size={ICON_SIZE.sm} />
  const openAdd = () => setDialog({ kind: "add" })

  return (
    <WalletShell
      title={wallet.name} subtitle={`${wallet.destination} · ${dates}`}
      backHref={walletsListPath(area)} backLabel={t("backToList")}
      actions={ready && <Button icon={addIcon} onClick={openAdd}>{t("addEntry")}</Button>}
      mobileActions={ready ? [{ icon: addIcon, label: t("addEntry"), onClick: openAdd }] : undefined}
    >
      <NetBalanceList balances={travel.balances} failed={travel.balancesFailed} />
      <section>
        <h2 className={styles.sectionTitle}>{t("entries")}</h2>
        {ready
          ? (
            <ExpenseList
              walletId={wallet.id} firstPage={travel.expenses}
              onOpen={(expense) => setDialog({ kind: "detail", expense })}
            />
          )
          : <ErrorState>{travel.errorMessage}</ErrorState>}
      </section>
      <WalletLinks wallet={wallet} area={area} />
      {ready && (
        <TravelDialogs
          wallet={wallet} members={travel.members} currentUserId={travel.currentUserId}
          dialog={dialog} onChange={setDialog} onSaved={handleSaved} onError={notifyError}
        />
      )}
      <Notify {...notify} onOpenChange={(open) => { if (!open) closeNotify() }} />
    </WalletShell>
  )
}
