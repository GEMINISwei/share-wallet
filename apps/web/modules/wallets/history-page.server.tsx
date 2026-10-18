import "server-only"
import { apiGet } from "@/shared/api/request.server"
import { getT } from "@/shared/i18n/locale.server"
import { walletsMessages } from "./i18n"
import type { WalletArea } from "./paths"
import type { WalletInfo } from "./types"
import { loadWallet, type WalletPageProps } from "./wallet.server"
import HistoryView, { type HistoryPage } from "./ui/HistoryView"
import WalletNotFound from "./ui/WalletNotFound"

export async function generateMetadata() {
  return { title: (await getT(walletsMessages))("history") }
}

const EMPTY = { list_data: [], next_cursor: null }

/** 兩種錢包的異動紀錄走不同的端點, 快照的形狀不同 (見後端 `entry_logs.py`)。 */
async function loadFirstPage(wallet: WalletInfo): Promise<{ page: HistoryPage; failed: boolean }> {
  const params = { id: wallet.id }
  if (wallet.kind === "travel") {
    const res = await apiGet({ url: "/wallets/{id}/expense-logs", params })
    const failed = res.status !== "success"
    return { page: { kind: "travel", data: res.status === "success" ? res.data : EMPTY }, failed }
  }
  const res = await apiGet({ url: "/wallets/{id}/entry-logs", params })
  const failed = res.status !== "success"
  return { page: { kind: "general", data: res.status === "success" ? res.data : EMPTY }, failed }
}

async function renderHistoryPage({ params }: WalletPageProps, area: WalletArea) {
  const { id } = await params
  const [wallet, t] = await Promise.all([loadWallet(id), getT(walletsMessages)])
  if (!wallet) return <WalletNotFound area={area} />
  const { page, failed } = await loadFirstPage(wallet)
  return (
    <HistoryView
      wallet={wallet} area={area} firstPage={page} errorMessage={failed ? t("historyFailed") : ""}
    />
  )
}

export default async function WalletHistoryPage(props: WalletPageProps) {
  return renderHistoryPage(props, "user")
}

export async function AdminWalletHistoryPage(props: WalletPageProps) {
  return renderHistoryPage(props, "admin")
}
