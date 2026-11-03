"use client"

import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button, ErrorState, ICON_SIZE, Notify, useNotify } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import {
  addEntryBlock, canAddEntry, myNetBalance, travelActions,
} from "../capabilities"
import { walletsMessages } from "../i18n"
import { type WalletArea, walletBackPath } from "../paths"
import type {
  ExpensePage, MemberInfo, NetBalanceInfo, SettlementTransferInfo, WalletInfo,
} from "../types"
import { useAddEntryFromUrl, useWalletAddEntry } from "./AddEntryNav"
import { useActiveWalletKind } from "./WalletNav"
import ExpenseList from "./ExpenseList"
import NetBalanceList, { NetBalancesDialog } from "./NetBalanceList"
import SettlementConfirm, { type SettlementStep } from "./SettlementConfirm"
import SettlementPanel from "./SettlementPanel"
import TravelDialogs, { type TravelDialog } from "./TravelDialogs"
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

/**
 * 旅遊錢包頁: 結算狀態與清償方案、每人淨額、帳目列表。標題列只放記一筆, 結算、成員、異動紀錄、
 * 設定都收進 ⋯; 手機另外只留摘要列 (我的淨額)、清償方案與帳目 (見 docs/features/ui.md〈錢包頁的版面〉)。
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
  useActiveWalletKind(wallet.kind)
  useAddEntryFromUrl(openAdd, block === null)
  const hasExpenses = travel.expenses.list_data.length > 0
  const canAdd = ready && travelActions(wallet).addEntry
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
      backHref={walletBackPath(wallet, area)} backLabel={t("backToList")} actionsDesktopOnly
      mobileActions={menu} menuOnDesktop
      actions={canAdd && <Button icon={<Plus size={ICON_SIZE.sm} />} onClick={openAdd}>{t("addEntry")}</Button>}
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
