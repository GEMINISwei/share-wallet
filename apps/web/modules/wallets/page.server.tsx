import "server-only"
import { redirect } from "next/navigation"
import { apiGet } from "@/shared/api/request.server"
import { getApiResponseErrorMessage } from "@/shared/api/error"
import { getT } from "@/shared/i18n/locale.server"
import { landingGroupId } from "./groups"
import { walletsMessages } from "./i18n"
import { walletGroupPath } from "./paths"
import WalletGroupPageView from "./ui/WalletGroupPageView"

export type WalletsPageProps = { searchParams?: Promise<{ kind?: string }> }

export async function generateMetadata() {
  return { title: (await getT(walletsMessages))("pageTitle") }
}

/**
 * `/wallets` 沒有自己的內容: 轉到第一個該看的群組 (見 docs/features.md〈錢包列表〉)。
 * 登入後、首頁、刪除或離開錢包之後都經過這裡。
 */
export default async function WalletsPage({ searchParams }: WalletsPageProps) {
  const kind = (await searchParams)?.kind === "travel" ? "travel" : undefined
  const res = await apiGet({ url: "/wallet-groups/" })
  if (res.status !== "success") {
    const t = await getT(walletsMessages)
    return <WalletGroupPageView errorMessage={getApiResponseErrorMessage(res, t("listFailed"))} />
  }
  redirect(walletGroupPath(landingGroupId(res.data.list_data, kind)))
}
