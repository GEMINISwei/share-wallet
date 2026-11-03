import "server-only"
import { getCurrentUser } from "@/modules/auth/public.server"
import { apiGet } from "@/shared/api/request.server"
import { getApiListData } from "@/shared/api/response"
import { getT } from "@/shared/i18n/locale.server"
import { transferTargets } from "./capabilities"
import { localMonth, parseMonth } from "./format"
import { walletsMessages } from "./i18n"
import type { WalletArea } from "./paths"
import type { WalletInfo } from "./types"
import { loadWallet, type WalletPageProps as WalletRouteProps } from "./wallet.server"
import WalletNotFound from "./ui/WalletNotFound"
import type { TravelLedger } from "./ui/TravelWalletView"
import WalletView, { type WalletLedger } from "./ui/WalletView"

export type WalletPageProps = WalletRouteProps & {
  /** 一般錢包的帳目月份 (`YYYY-MM`)。 */
  searchParams?: Promise<{ month?: string | string[] }>
}

export async function generateMetadata({ params }: WalletPageProps) {
  const wallet = await loadWallet((await params).id)
  return { title: wallet?.name ?? (await getT(walletsMessages))("notFound") }
}

/**
 * 一般錢包頁就是帳目, 一次一個月 (見 docs/features/general-wallet.md〈帳目列表〉); 旅遊錢包沒有, 是 null。
 * 網址沒指定月份時先用伺服器時區的這個月, 跟使用者的不同時由畫面換掉 (`MonthNav`)。
 */
async function loadLedger(
  wallet: WalletInfo, urlMonth: string | null,
): Promise<WalletLedger | null> {
  if (wallet.kind !== "general") return null
  const params = { id: wallet.id }
  const month = urlMonth ?? localMonth()
  const [entriesRes, categoriesRes, targetsRes, walletsRes, currentUser, t] = await Promise.all([
    apiGet({ url: "/wallets/{id}/entries", params, query: { month } }),
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
    month,
    monthFromUrl: urlMonth !== null,
  }
}

/** 旅遊錢包頁是淨額與帳目; 一般錢包是 null。 */
async function loadTravel(wallet: WalletInfo): Promise<TravelLedger | null> {
  if (wallet.kind !== "travel") return null
  const params = { id: wallet.id }
  // 進行中沒有清償方案, 不必查。
  const settling = wallet.status !== "active"
  const [expensesRes, balancesRes, membersRes, settlementRes, currentUser, t] = await Promise.all([
    apiGet({ url: "/wallets/{id}/expenses", params }),
    // 淨額取不到時只是那一塊顯示錯誤, 不擋帳目列表。
    apiGet({ url: "/wallets/{id}/net-balances", params }),
    // 記一筆的付款人與分攤對象; 取不到就不能記帳。
    apiGet({ url: "/wallets/{id}/members", params }),
    // 清償方案取不到時只是那一塊顯示錯誤。
    settling ? apiGet({ url: "/wallets/{id}/settlement", params }) : null,
    getCurrentUser(),
    getT(walletsMessages),
  ])
  const failed = expensesRes.status !== "success" || membersRes.status !== "success"
  const settlementOk = settlementRes?.status === "success"
  return {
    expenses: expensesRes.status === "success" ? expensesRes.data : { list_data: [], next_cursor: null },
    balances: getApiListData(balancesRes),
    members: getApiListData(membersRes),
    transfers: settlementOk ? settlementRes.data.transfers : [],
    currentUserId: currentUser.data?.id ?? "",
    errorMessage: failed ? t("entriesFailed") : "",
    balancesFailed: balancesRes.status !== "success",
    settlementFailed: settling && !settlementOk,
  }
}

async function renderWalletPage({ params, searchParams }: WalletPageProps, area: WalletArea) {
  const wallet = await loadWallet((await params).id)
  if (!wallet) return <WalletNotFound area={area} />
  const month = parseMonth((await searchParams)?.month)
  const [ledger, travel] = await Promise.all([loadLedger(wallet, month), loadTravel(wallet)])
  return <WalletView wallet={wallet} area={area} ledger={ledger} travel={travel} />
}

export default async function WalletPage(props: WalletPageProps) {
  return renderWalletPage(props, "user")
}

export async function AdminWalletPage(props: WalletPageProps) {
  return renderWalletPage(props, "admin")
}
