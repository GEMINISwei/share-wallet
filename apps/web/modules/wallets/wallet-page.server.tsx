import "server-only"
import { getCurrentUser } from "@/modules/auth/public.server"
import { apiGet } from "@/shared/api/request.server"
import { getApiListData } from "@/shared/api/response"
import { getT } from "@/shared/i18n/locale.server"
import { transferTargets } from "./capabilities"
import { walletsMessages } from "./i18n"
import type { WalletArea } from "./paths"
import type { WalletInfo } from "./types"
import { loadWallet, type WalletPageProps } from "./wallet.server"
import WalletNotFound from "./ui/WalletNotFound"
import WalletView, { type WalletLedger } from "./ui/WalletView"

export type { WalletPageProps } from "./wallet.server"

export async function generateMetadata({ params }: WalletPageProps) {
  const wallet = await loadWallet((await params).id)
  return { title: wallet?.name ?? (await getT(walletsMessages))("notFound") }
}

/** 一般錢包頁就是帳目 (見 docs/features.md〈帳目列表〉); 旅遊錢包沒有, 是 null。 */
async function loadLedger(wallet: WalletInfo): Promise<WalletLedger | null> {
  if (wallet.kind !== "general") return null
  const params = { id: wallet.id }
  const [entriesRes, categoriesRes, targetsRes, walletsRes, currentUser, t] = await Promise.all([
    apiGet({ url: "/wallets/{id}/entries", params }),
    apiGet({ url: "/wallets/{id}/categories", params }),
    // 代墊未還清單與對象的輸入提示; 取不到時只是不顯示, 不擋整頁。
    apiGet({ url: "/wallets/{id}/advance-targets", params }),
    // 轉帳的對方錢包選單; 取不到時只是不能轉帳, 不擋整頁。
    apiGet({ url: "/wallets/" }),
    getCurrentUser(),
    getT(walletsMessages),
  ])
  const failed = entriesRes.status !== "success" || categoriesRes.status !== "success"
  return {
    entries: entriesRes.status === "success" ? entriesRes.data : { list_data: [], next_cursor: null },
    categories: getApiListData(categoriesRes),
    advanceTargets: getApiListData(targetsRes),
    transferTargets: transferTargets(getApiListData(walletsRes), wallet.id),
    currentUserId: currentUser.data?.id ?? "",
    errorMessage: failed ? t("entriesFailed") : "",
  }
}

async function renderWalletPage({ params }: WalletPageProps, area: WalletArea) {
  const wallet = await loadWallet((await params).id)
  if (!wallet) return <WalletNotFound area={area} />
  return <WalletView wallet={wallet} area={area} ledger={await loadLedger(wallet)} />
}

export default async function WalletPage(props: WalletPageProps) {
  return renderWalletPage(props, "user")
}

export async function AdminWalletPage(props: WalletPageProps) {
  return renderWalletPage(props, "admin")
}
