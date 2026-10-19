"use client"

import { Button, ErrorState, useActionSubmit } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { confirmSettlementTransfer, markSettlementPaid } from "../actions"
import { settlementTransferActions, transfersForViewer } from "../capabilities"
import { walletsMessages } from "../i18n"
import type { SettlementTransferInfo, WalletInfo } from "../types"
import Amount from "./Amount"
import styles from "./wallets.module.css"

type SettlementPanelProps = {
  wallet: WalletInfo
  transfers: SettlementTransferInfo[]
  currentUserId: string
  failed: boolean
  onDone: (message: string) => void
  onError: (message: string) => void
}

/** 結算中與已結帳時的清償方案: 每一筆的狀態, 以及自己能按的付款、確認按鈕。 */
export default function SettlementPanel({
  wallet, transfers, currentUserId, failed, onDone, onError,
}: SettlementPanelProps) {
  const t = useT(walletsMessages)
  const { isPending, submit } = useActionSubmit()
  const viewer = { userId: currentUserId, canManage: wallet.can_manage }

  function run(action: () => ReturnType<typeof markSettlementPaid>, message: string) {
    submit(action, { onSuccess: () => onDone(message), onError, errorFallback: t("settlementFailed") })
  }

  function buttons(transfer: SettlementTransferInfo) {
    const can = settlementTransferActions(transfer, viewer, wallet.status)
    const items = [
      can.markPaid && {
        label: t("markPaid"), message: t("paidMarked"),
        action: () => markSettlementPaid(wallet.id, transfer.id, true),
      },
      can.unmarkPaid && {
        label: t("unmarkPaid"), message: t("paidUnmarked"),
        action: () => markSettlementPaid(wallet.id, transfer.id, false),
      },
      can.confirm && {
        label: t("confirmReceived"), message: t("receivedConfirmed"),
        action: () => confirmSettlementTransfer(wallet.id, transfer.id, true),
      },
      can.unconfirm && {
        label: t("unconfirmReceived"), message: t("receivedUnconfirmed"),
        action: () => confirmSettlementTransfer(wallet.id, transfer.id, false),
      },
    ].filter((item) => item !== false)
    return items.map((item) => (
      <Button
        key={item.label} variant="outlined" disabled={isPending}
        onClick={() => run(item.action, item.message)}
      >
        {item.label}
      </Button>
    ))
  }

  function statusText(transfer: SettlementTransferInfo) {
    if (transfer.confirmed_by) return t("transferConfirmed", { name: transfer.confirmed_by.nickname })
    return transfer.paid_at ? t("transferPaid") : t("transferWaiting")
  }

  return (
    <section>
      <h2 className={styles.sectionTitle}>{t("settlementPlan")}</h2>
      {failed && <ErrorState>{t("settlementPlanFailed")}</ErrorState>}
      {!failed && transfers.length === 0 && <p className={styles.hint}>{t("settlementPlanEmpty")}</p>}
      {!failed && transfers.length > 0 && (
        <ul className={styles.list}>
          {transfersForViewer(transfers, currentUserId).map((transfer) => (
            <li key={transfer.id} className={styles.settlementRow}>
              <span className={styles.row}>
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>
                    {t("transferLine", {
                      payer: transfer.payer.nickname, payee: transfer.payee.nickname,
                    })}
                  </span>
                  <span className={styles.rowMeta}>{statusText(transfer)}</span>
                </span>
                <Amount value={transfer.amount} />
              </span>
              <span className={styles.settlementActions}>{buttons(transfer)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
