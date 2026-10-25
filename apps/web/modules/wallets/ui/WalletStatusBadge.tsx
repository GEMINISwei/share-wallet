"use client"

import { StatusBadge } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { walletStatusBadge } from "../capabilities"
import { walletsMessages } from "../i18n"
import type { WalletStatus } from "../types"

/** 旅遊錢包的「結算中」「已結帳」標籤; 進行中不顯示。 */
export default function WalletStatusBadge({ wallet }: { wallet: { status: WalletStatus } }) {
  const t = useT(walletsMessages)
  const badge = walletStatusBadge(wallet)
  if (!badge) return null
  return badge === "settling"
    ? <StatusBadge label={t("statusSettling")} variant="warning" />
    : <StatusBadge label={t("statusSettled")} variant="muted" />
}
