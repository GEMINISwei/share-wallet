import "server-only"
import { redirect } from "next/navigation"
import { apiGet } from "@/shared/api/request.server"
import { getApiResponseErrorMessage } from "@/shared/api/error"
import { getT } from "@/shared/i18n/locale.server"
import { landingPath } from "./groups"
import { walletsMessages } from "./i18n"
import WalletGroupPageView from "./ui/WalletGroupPageView"

export async function generateMetadata() {
  return { title: (await getT(walletsMessages))("pageTitle") }
}

/**
 * `/wallets` 沒有自己的內容: 轉到第一個該看的頁面 (見 docs/features/wallets.md〈錢包列表〉)。
 * 登入後、首頁、刪除或離開錢包之後都經過這裡。
 */
export default async function WalletsPage() {
  const [groupsRes, walletsRes] = await Promise.all([
    apiGet({ url: "/wallet-groups/" }), apiGet({ url: "/wallets/" }),
  ])
  if (groupsRes.status !== "success" || walletsRes.status !== "success") {
    const failed = groupsRes.status !== "success" ? groupsRes : walletsRes
    const t = await getT(walletsMessages)
    return <WalletGroupPageView errorMessage={getApiResponseErrorMessage(failed, t("listFailed"))} />
  }
  redirect(landingPath(groupsRes.data.list_data, walletsRes.data.list_data))
}
