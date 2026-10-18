import "server-only"
import { redirect } from "next/navigation"
import { apiGet } from "@/shared/api/request.server"
import { getT } from "@/shared/i18n/locale.server"
import { walletSections } from "./capabilities"
import { walletsMessages } from "./i18n"
import { type WalletArea, walletPath } from "./paths"
import { loadWallet, type WalletPageProps } from "./wallet.server"
import HistoryView from "./ui/HistoryView"
import WalletNotFound from "./ui/WalletNotFound"

export async function generateMetadata() {
  return { title: (await getT(walletsMessages))("history") }
}

async function renderHistoryPage({ params }: WalletPageProps, area: WalletArea) {
  const { id } = await params
  const [wallet, t] = await Promise.all([loadWallet(id), getT(walletsMessages)])
  if (!wallet) return <WalletNotFound area={area} />
  // 旅遊錢包還沒有帳目 (後端回 400), 直接回到錢包頁。
  if (!walletSections(wallet).history) redirect(walletPath(wallet.id, area))

  const res = await apiGet({ url: "/wallets/{id}/entry-logs", params: { id } })
  return (
    <HistoryView
      wallet={wallet}
      area={area}
      firstPage={res.status === "success" ? res.data : { list_data: [], next_cursor: null }}
      errorMessage={res.status === "success" ? "" : t("historyFailed")}
    />
  )
}

export default async function WalletHistoryPage(props: WalletPageProps) {
  return renderHistoryPage(props, "user")
}

export async function AdminWalletHistoryPage(props: WalletPageProps) {
  return renderHistoryPage(props, "admin")
}
