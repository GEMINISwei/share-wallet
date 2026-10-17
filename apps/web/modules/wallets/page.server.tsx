import "server-only"
import { apiGet } from "@/shared/api/request.server"
import { getApiResponseErrorMessage } from "@/shared/api/error"
import { getT } from "@/shared/i18n/locale.server"
import { walletsMessages } from "./i18n"
import WalletsView from "./ui/WalletsView"

export async function generateMetadata() {
  return { title: (await getT(walletsMessages))("pageTitle") }
}

export default async function WalletsPage() {
  const t = await getT(walletsMessages)
  const res = await apiGet({ url: "/wallets/" })
  if (res.status !== "success") {
    return (
      <WalletsView
        wallets={[]}
        totalBalance={0}
        errorMessage={getApiResponseErrorMessage(res, t("listFailed"))}
      />
    )
  }
  return (
    <WalletsView wallets={res.data.list_data} totalBalance={res.data.total_balance} errorMessage="" />
  )
}
