"use client"

import { Plus, Scale } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button, ErrorState, ICON_SIZE, Notify, useNotify } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { canAddEntry } from "../capabilities"
import { walletsMessages } from "../i18n"
import { type WalletArea, walletsListPath } from "../paths"
import type {
  AdvanceTargetInfo, CategoryInfo, EntryPage, TransferTarget, WalletInfo,
} from "../types"
import EntryList from "./EntryList"
import LedgerDialogs, { type LedgerDialog } from "./LedgerDialogs"
import OwingList, { OwingDialog } from "./OwingList"
import TravelWalletView, { type TravelLedger } from "./TravelWalletView"
import { useFavoriteAction } from "./useFavoriteAction"
import WalletLinks from "./WalletLinks"
import WalletShell from "./WalletShell"
import WalletSummary from "./WalletSummary"
import { useWalletMenu } from "./useWalletMenu"
import styles from "./wallets.module.css"

/** 一般錢包才有的帳目資料; 旅遊錢包是 null。 */
export type WalletLedger = {
  entries: EntryPage
  categories: CategoryInfo[]
  /** 這個錢包用過的代墊對象 (含已還清的), 依名字排序。 */
  advanceTargets: AdvanceTargetInfo[]
  transferTargets: TransferTarget[]
  currentUserId: string
  errorMessage: string
}

type WalletViewProps = {
  wallet: WalletInfo
  area: WalletArea
  ledger: WalletLedger | null
  /** 旅遊錢包的帳目資料; 一般錢包是 null。 */
  travel: TravelLedger | null
}

export default function WalletView({ wallet, area, ledger, travel }: WalletViewProps) {
  if (travel) return <TravelWalletView wallet={wallet} area={area} travel={travel} />
  return <GeneralWalletView wallet={wallet} area={area} ledger={ledger} />
}

function GeneralWalletView(
  { wallet, area, ledger }: { wallet: WalletInfo; area: WalletArea; ledger: WalletLedger | null },
) {
  const t = useT(walletsMessages)
  const router = useRouter()
  const [dialog, setDialog] = useState<LedgerDialog>(null)
  const [owingOpen, setOwingOpen] = useState(false)
  const { notify, notifyError, notifySuccess, closeNotify } = useNotify()

  function handleSaved(message: string) {
    setDialog(null)
    notifySuccess(message)
    router.refresh()
  }

  // 記一筆在桌機放標題列、手機放摘要列; 空的列表也不再放一顆。
  const addIcon = <Plus size={ICON_SIZE.sm} />
  const adjustIcon = <Scale size={ICON_SIZE.sm} />
  const openAdd = () => setDialog({ kind: "add" })
  const openAdjust = () => setDialog({ kind: "adjust" })
  const favorite = useFavoriteAction(wallet, { success: notifySuccess, error: notifyError })
  const ledgerReady = Boolean(ledger) && !ledger?.errorMessage
  const menu = useWalletMenu(wallet, area, {
    ready: Boolean(ledger), favorite,
    handlers: ledger ? { adjust: openAdjust, owing: () => setOwingOpen(true) } : {},
  })

  return (
    <WalletShell
      title={wallet.name} subtitle={t("kindGeneral")} backHref={walletsListPath(area, wallet.kind)} backLabel={t("backToList")}
      actions={(ledger || favorite) && (
        <>
          {favorite && (
            <Button variant="outlined" icon={favorite.icon} onClick={favorite.onClick}>
              {favorite.label}
            </Button>
          )}
          {ledger && <Button variant="outlined" icon={adjustIcon} onClick={openAdjust}>{t("adjustBalance")}</Button>}
          {ledger && <Button icon={addIcon} onClick={openAdd}>{t("addEntry")}</Button>}
        </>
      )}
      mobileActions={menu}
    >
      {wallet.balance !== null && (
        <WalletSummary
          label={t("balance")} value={wallet.balance}
          onAdd={canAddEntry(wallet, ledgerReady) ? openAdd : undefined}
        />
      )}
      {ledger && <OwingList targets={ledger.advanceTargets} />}
      {ledger && (
        <section>
          <h2 className={styles.sectionTitle}>{t("entries")}</h2>
          {ledger.errorMessage
            ? <ErrorState>{ledger.errorMessage}</ErrorState>
            : (
              <EntryList
                walletId={wallet.id} firstPage={ledger.entries}
                onOpen={(entry) => setDialog({ kind: "detail", entry })}
              />
            )}
        </section>
      )}
      <WalletLinks wallet={wallet} area={area} />
      {ledger && (
        <>
          <LedgerDialogs
            wallet={wallet} categories={ledger.categories} transferTargets={ledger.transferTargets}
            targetNames={ledger.advanceTargets.map((target) => target.name)}
            currentUserId={ledger.currentUserId}
            dialog={dialog} onChange={setDialog} onSaved={handleSaved} onError={notifyError}
          />
          <OwingDialog
            targets={ledger.advanceTargets} open={owingOpen} onClose={() => setOwingOpen(false)}
          />
        </>
      )}
      <Notify {...notify} onOpenChange={(open) => { if (!open) closeNotify() }} />
    </WalletShell>
  )
}
