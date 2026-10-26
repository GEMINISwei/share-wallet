"use client"

import { Flag, Plus, Undo2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button, ErrorState, ICON_SIZE, type MenuItem, Notify, useNotify } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import {
  addEntryBlock, canAddEntry, canStartSettlement, myNetBalance, travelActions,
} from "../capabilities"
import { walletsMessages } from "../i18n"
import { type WalletArea, walletsListPath } from "../paths"
import type {
  ExpensePage, MemberInfo, NetBalanceInfo, SettlementTransferInfo, WalletInfo,
} from "../types"
import { useAddEntryFromUrl, useWalletAddEntry } from "./AddEntryNav"
import ExpenseList from "./ExpenseList"
import NetBalanceList, { NetBalancesDialog } from "./NetBalanceList"
import SettlementConfirm, { type SettlementStep } from "./SettlementConfirm"
import SettlementPanel from "./SettlementPanel"
import TravelDialogs, { type TravelDialog } from "./TravelDialogs"
import WalletLinks from "./WalletLinks"
import WalletShell from "./WalletShell"
import WalletStatusBadge from "./WalletStatusBadge"
import WalletSummary from "./WalletSummary"
import { useFavoriteAction } from "./useFavoriteAction"
import { useWalletMenu } from "./useWalletMenu"
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

/** 桌機標題列的按鈕: 進行中記帳、管理者開始結算; 結算中管理者可以取消。手機改用 ⋮ 選單。 */
function useHeaderActions(wallet: WalletInfo, ready: boolean, canStart: boolean, open: {
  add: () => void; settlement: (step: SettlementStep) => void
}, favorite: MenuItem | null) {
  const t = useT(walletsMessages)
  const can = travelActions(wallet)
  const items = ([
    ready && can.addEntry && { icon: <Plus size={ICON_SIZE.sm} />, label: t("addEntry"), onClick: open.add },
    canStart && {
      icon: <Flag size={ICON_SIZE.sm} />, label: t("startSettlement"),
      onClick: () => open.settlement("start"),
    },
    can.cancelSettlement && {
      icon: <Undo2 size={ICON_SIZE.sm} />, label: t("cancelSettlement"),
      onClick: () => open.settlement("cancel"),
    },
    favorite,
  ] as (MenuItem | boolean | null)[]).filter((item): item is MenuItem => typeof item === "object" && item !== null)
  // 只有記一筆是主要按鈕; 結帳之後剩下的 (最愛) 不該變成實心的。
  const buttons = items.map((item) => (
    <Button
      key={item.label} icon={item.icon} onClick={item.onClick}
      variant={item.onClick === open.add ? "contained" : "outlined"}
    >
      {item.label}
    </Button>
  ))
  return buttons.length > 0 && <>{buttons}</>
}

/**
 * 旅遊錢包頁: 結算狀態與清償方案、每人淨額、帳目列表, 以及成員、異動紀錄、設定的入口。
 * 手機只留摘要列 (我的淨額)、清償方案與帳目, 其他收進 ⋮ 選單 (見 docs/features.md〈錢包頁的版面〉)。
 */
export default function TravelWalletView({ wallet, area, travel }: TravelWalletViewProps) {
  const t = useT(walletsMessages)
  const router = useRouter()
  const ready = !travel.errorMessage
  const block = addEntryBlock(wallet, ready)
  const [dialog, setDialog] = useState<TravelDialog>(null)
  const [settlementStep, setSettlementStep] = useState<SettlementStep>(null)
  const [balancesOpen, setBalancesOpen] = useState(false)
  const { notify, notifyError, notifySuccess, notifyInfo, closeNotify } = useNotify()
  const dates = t("dateRange", { start: wallet.start_date ?? "", end: wallet.end_date ?? "" })
  const favorite = useFavoriteAction(wallet, { success: notifySuccess, error: notifyError })
  const openAdd = () => setDialog({ kind: "add" })
  useWalletAddEntry(block, openAdd, notifyInfo)
  useAddEntryFromUrl(openAdd, block === null)
  const hasExpenses = travel.expenses.list_data.length > 0
  const actions = useHeaderActions(
    wallet, ready, canStartSettlement(wallet, ready, hasExpenses),
    { add: openAdd, settlement: setSettlementStep }, favorite,
  )
  const menu = useWalletMenu(wallet, area, {
    state: { ready, hasOwing: false, hasExpenses }, favorite,
    handlers: {
      startSettlement: () => setSettlementStep("start"),
      cancelSettlement: () => setSettlementStep("cancel"),
      netBalances: () => setBalancesOpen(true),
    },
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
      backHref={walletsListPath(area, wallet.kind)} backLabel={t("backToList")} actionsDesktopOnly
      actions={actions} mobileActions={menu} mobileActionsTitle={wallet.name}
    >
      <WalletSummary
        mobileOnly label={t("myNetBalance")}
        value={myNetBalance(travel.balances, travel.currentUserId, travel.balancesFailed)}
        onAdd={area === "admin" && canAddEntry(wallet, ready) ? openAdd : undefined}
      />
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
        <h2 className={`${styles.sectionTitle} ${styles.ledgerTitle}`}>{t("entries")}</h2>
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
      <NetBalancesDialog
        balances={travel.balances} failed={travel.balancesFailed}
        open={balancesOpen} onClose={() => setBalancesOpen(false)}
      />
      <SettlementConfirm
        walletId={wallet.id} step={settlementStep} onClose={() => setSettlementStep(null)}
        onDone={handleSaved} onError={notifyError}
      />
      <Notify {...notify} onOpenChange={(open) => { if (!open) closeNotify() }} />
    </WalletShell>
  )
}
