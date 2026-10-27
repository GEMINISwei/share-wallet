import "server-only"
import { redirect } from "next/navigation"
import { apiGet } from "@/shared/api/request.server"
import { getApiResponseErrorMessage } from "@/shared/api/error"
import { getT } from "@/shared/i18n/locale.server"
import { groupWallets } from "./groups"
import { walletsMessages } from "./i18n"
import { WALLETS_PATH } from "./manifest"
import WalletGroupPageView from "./ui/WalletGroupPageView"

export type WalletGroupPageProps = { params: Promise<{ groupId: string }> }

export async function generateMetadata() {
  return { title: (await getT(walletsMessages))("pageTitle") }
}

/** 一個錢包群組: 群組總額與裡面顯示中的錢包 (見 docs/features.md〈錢包列表〉)。 */
export default async function WalletGroupPage({ params }: WalletGroupPageProps) {
  const { groupId } = await params
  const [groupsRes, walletsRes, t] = await Promise.all([
    apiGet({ url: "/wallet-groups/" }), apiGet({ url: "/wallets/" }), getT(walletsMessages),
  ])
  if (groupsRes.status !== "success" || walletsRes.status !== "success") {
    const failed = groupsRes.status !== "success" ? groupsRes : walletsRes
    return <WalletGroupPageView errorMessage={getApiResponseErrorMessage(failed, t("listFailed"))} />
  }
  // 刪掉的群組或別人的群組: 回到第一個該看的群組, 不另外做一頁「群組不存在」。
  const group = groupsRes.data.list_data.find((item) => item.id === groupId)
  if (!group) redirect(WALLETS_PATH)
  return (
    <WalletGroupPageView
      group={group} wallets={groupWallets(walletsRes.data.list_data, group.id)} errorMessage=""
    />
  )
}
