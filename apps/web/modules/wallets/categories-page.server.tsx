import "server-only"
import { redirect } from "next/navigation"
import { apiGet } from "@/shared/api/request.server"
import { getApiListData } from "@/shared/api/response"
import { getT } from "@/shared/i18n/locale.server"
import { walletSections } from "./capabilities"
import { walletsMessages } from "./i18n"
import { walletPath } from "./paths"
import { loadWallet, type WalletPageProps } from "./wallet.server"
import CategoriesView from "./ui/CategoriesView"
import WalletNotFound from "./ui/WalletNotFound"

export async function generateMetadata() {
  return { title: (await getT(walletsMessages))("categories") }
}

export default async function WalletCategoriesPage({ params }: WalletPageProps) {
  const { id } = await params
  const [wallet, t] = await Promise.all([loadWallet(id), getT(walletsMessages)])
  if (!wallet) return <WalletNotFound />
  // 旅遊錢包沒有分類 (後端回 400), 直接回到錢包頁。
  if (!walletSections(wallet).categories) redirect(walletPath(wallet.id))

  const res = await apiGet({ url: "/wallets/{id}/categories", params: { id } })
  return (
    <CategoriesView
      wallet={wallet}
      categories={getApiListData(res)}
      errorMessage={res.status === "success" ? "" : t("categoriesFailed")}
    />
  )
}
