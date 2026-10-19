"use client"

import { useActionSubmit } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { cancelSettlement, startSettlement } from "../actions"
import { walletsMessages } from "../i18n"
import ConfirmDialog from "./ConfirmDialog"

export type SettlementStep = "start" | "cancel" | null

type SettlementConfirmProps = {
  walletId: string
  step: SettlementStep
  onClose: () => void
  onDone: (message: string) => void
  onError: (message: string) => void
}

/** 開始與取消結算前的確認框: 兩個都會改掉整個錢包的狀態, 先說清楚會發生什麼。 */
export default function SettlementConfirm({
  walletId, step, onClose, onDone, onError,
}: SettlementConfirmProps) {
  const t = useT(walletsMessages)
  const { isPending, submit } = useActionSubmit()
  const starting = step === "start"

  function confirm() {
    submit(() => (starting ? startSettlement(walletId) : cancelSettlement(walletId)), {
      onSuccess: () => onDone(starting ? t("settlementStarted") : t("settlementCancelled")),
      onError: (message) => {
        onClose()
        onError(message)
      },
      errorFallback: t("settlementFailed"),
    })
  }

  return (
    <ConfirmDialog
      open={step !== null} isPending={isPending} onConfirm={confirm} onClose={onClose}
      message={starting ? t("startSettlementConfirm") : t("cancelSettlementConfirm")}
    />
  )
}
