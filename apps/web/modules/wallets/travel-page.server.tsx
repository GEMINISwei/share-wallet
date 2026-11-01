import "server-only"
import { apiGet } from "@/shared/api/request.server"
import { getApiResponseErrorMessage } from "@/shared/api/error"
import { getT } from "@/shared/i18n/locale.server"
import { travelWallets } from "./groups"
import { walletsMessages } from "./i18n"
import WalletGroupPageView from "./ui/WalletGroupPageView"

export async function generateMetadata() {
  return { title: (await getT(walletsMessages))("travelWallets") }
}

/** 旅遊錢包頁: 旅遊錢包不分群組, 一頁列出顯示中的 (見 docs/features/wallets.md〈錢包列表〉)。 */
export default async function TravelWalletsPage() {
  const [res, t] = await Promise.all([apiGet({ url: "/wallets/" }), getT(walletsMessages)])
  if (res.status !== "success") {
    return <WalletGroupPageView errorMessage={getApiResponseErrorMessage(res, t("listFailed"))} />
  }
  const wallets = travelWallets(res.data.list_data)
  return <WalletGroupPageView page={{ kind: "travel", wallets }} errorMessage="" />
}
