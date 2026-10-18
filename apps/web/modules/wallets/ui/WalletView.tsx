"use client"

import { Plus, Scale } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button, ErrorState, ICON_SIZE, Notify, useNotify } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { owingTargets } from "../capabilities"
import { walletsMessages } from "../i18n"
import { type WalletArea, walletsListPath } from "../paths"
import type {
  AdvanceTargetInfo, CategoryInfo, EntryPage, TransferTarget, WalletInfo,
} from "../types"
import Amount from "./Amount"
import EntryList from "./EntryList"
import LedgerDialogs, { type LedgerDialog } from "./LedgerDialogs"
import TravelWalletView, { type TravelLedger } from "./TravelWalletView"
import WalletLinks from "./WalletLinks"
import WalletShell from "./WalletShell"
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
  const { notify, notifyError, notifySuccess, closeNotify } = useNotify()

  function handleSaved(message: string) {
    setDialog(null)
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
      title={wallet.name} subtitle={t("kindGeneral")} backHref={walletsListPath(area)} backLabel={t("backToList")}
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
        <LedgerDialogs
          wallet={wallet} categories={ledger.categories} transferTargets={ledger.transferTargets}
          targetNames={ledger.advanceTargets.map((target) => target.name)}
          currentUserId={ledger.currentUserId}
          dialog={dialog} onChange={setDialog} onSaved={handleSaved} onError={notifyError}
        />
      )}
      <Notify {...notify} onOpenChange={(open) => { if (!open) closeNotify() }} />
    </WalletShell>
  )
}

/** 代墊未還的清單, 只是顯示: 還款一律從代墊的詳情操作 (見 docs/features.md〈代墊與還款〉)。 */
function OwingList({ targets }: { targets: AdvanceTargetInfo[] }) {
  const t = useT(walletsMessages)
  const owing = owingTargets(targets)
  if (owing.length === 0) return null
  return (
    <section>
      <h2 className={styles.sectionTitle}>{t("owingList")}</h2>
      <ul className={`${styles.fieldList} ${styles.owingList}`}>
        {owing.map((target) => (
          <li key={target.name} className={styles.fieldRow}>
            <span>{target.name}</span>
            <Amount value={target.outstanding} />
          </li>
        ))}
      </ul>
    </section>
  )
}
