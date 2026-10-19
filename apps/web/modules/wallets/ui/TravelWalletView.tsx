"use client"

import { Flag, Plus, Undo2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button, ErrorState, ICON_SIZE, Notify, useNotify } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { travelActions } from "../capabilities"
import { walletsMessages } from "../i18n"
import { type WalletArea, walletsListPath } from "../paths"
import type {
  ExpensePage, MemberInfo, NetBalanceInfo, SettlementTransferInfo, WalletInfo,
} from "../types"
import ExpenseList from "./ExpenseList"
import NetBalanceList from "./NetBalanceList"
import SettlementConfirm, { type SettlementStep } from "./SettlementConfirm"
import SettlementPanel from "./SettlementPanel"
import TravelDialogs, { type TravelDialog } from "./TravelDialogs"
import WalletLinks from "./WalletLinks"
import WalletShell from "./WalletShell"
import WalletStatusBadge from "./WalletStatusBadge"
import styles from "./wallets.module.css"

/** 旅遊錢包頁的資料。 */
export type TravelLedger = {
  expenses: ExpensePage
  balances: NetBalanceInfo[]
  /** 加入錢包的順序, 記一筆時的付款人與分攤對象。 */
  members: MemberInfo[]
  /** 清償方案; 進行中沒有。 */
  transfers: SettlementTransferInfo[]
  currentUserId: string
  /** 帳目或成員載入失敗: 不顯示列表, 也不能記帳。 */
  errorMessage: string
  balancesFailed: boolean
  settlementFailed: boolean
}

type TravelWalletViewProps = { wallet: WalletInfo; area: WalletArea; travel: TravelLedger }

function useHeaderActions(wallet: WalletInfo, ready: boolean, open: {
  add: () => void; settlement: (step: SettlementStep) => void
}) {
  const t = useT(walletsMessages)
  const can = travelActions(wallet)
  // 記帳與結算的入口只放標題列 (手機收進 ⋮ 選單), 理由同一般錢包。
  const items = [
    ready && can.addEntry && { icon: <Plus size={ICON_SIZE.sm} />, label: t("addEntry"), onClick: open.add },
    ready && can.startSettlement && {
      icon: <Flag size={ICON_SIZE.sm} />, label: t("startSettlement"),
      onClick: () => open.settlement("start"),
    },
    can.cancelSettlement && {
      icon: <Undo2 size={ICON_SIZE.sm} />, label: t("cancelSettlement"),
      onClick: () => open.settlement("cancel"),
    },
  ].filter((item) => item !== false)
  const buttons = items.map((item, index) => (
    <Button
      key={item.label} icon={item.icon} onClick={item.onClick}
      variant={index === 0 ? "contained" : "outlined"}
    >
      {item.label}
    </Button>
  ))
  return {
    actions: buttons.length > 0 && <>{buttons}</>,
    mobileActions: items.length > 0 ? items : undefined,
  }
}

/** 旅遊錢包頁: 結算狀態與清償方案、每人淨額、帳目列表, 以及成員、異動紀錄、設定的入口。 */
export default function TravelWalletView({ wallet, area, travel }: TravelWalletViewProps) {
  const t = useT(walletsMessages)
  const router = useRouter()
  const [dialog, setDialog] = useState<TravelDialog>(null)
  const [settlementStep, setSettlementStep] = useState<SettlementStep>(null)
  const { notify, notifyError, notifySuccess, closeNotify } = useNotify()
  const dates = t("dateRange", { start: wallet.start_date ?? "", end: wallet.end_date ?? "" })
  const ready = !travel.errorMessage
  const header = useHeaderActions(wallet, ready, {
    add: () => setDialog({ kind: "add" }), settlement: setSettlementStep,
  })

  function handleSaved(message: string) {
    setDialog(null)
    setSettlementStep(null)
    notifySuccess(message)
    router.refresh()
  }

  return (
    <WalletShell
      title={wallet.name} subtitle={`${wallet.destination} · ${dates}`}
      backHref={walletsListPath(area)} backLabel={t("backToList")}
      actions={header.actions} mobileActions={header.mobileActions}
    >
      {wallet.status !== "active" && (
        <>
          <p className={`${styles.hint} ${styles.statusLine}`}>
            <WalletStatusBadge wallet={wallet} />
            {wallet.status === "settling" ? t("ledgerLockedHint") : t("archivedHint")}
          </p>
          <SettlementPanel
            wallet={wallet} transfers={travel.transfers} currentUserId={travel.currentUserId}
            failed={travel.settlementFailed} onDone={handleSaved} onError={notifyError}
          />
        </>
      )}
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
      <SettlementConfirm
        walletId={wallet.id} step={settlementStep} onClose={() => setSettlementStep(null)}
        onDone={handleSaved} onError={notifyError}
      />
      <Notify {...notify} onOpenChange={(open) => { if (!open) closeNotify() }} />
    </WalletShell>
  )
}
