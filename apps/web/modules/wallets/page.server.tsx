import "server-only"
import { apiGet } from "@/shared/api/request.server"
import { getApiResponseErrorMessage } from "@/shared/api/error"
import { getT } from "@/shared/i18n/locale.server"
import { walletListTab } from "./capabilities"
import { walletsMessages } from "./i18n"
import WalletsView from "./ui/WalletsView"

export type WalletsPageProps = { searchParams?: Promise<{ tab?: string }> }

export async function generateMetadata() {
  return { title: (await getT(walletsMessages))("pageTitle") }
}

export default async function WalletsPage({ searchParams }: WalletsPageProps) {
  const t = await getT(walletsMessages)
  const tab = walletListTab((await searchParams)?.tab)
  const res = await apiGet({ url: "/wallets/" })
  if (res.status !== "success") {
    return (
      <WalletsView
        tab={tab}
        wallets={[]}
        totalBalance={0}
        errorMessage={getApiResponseErrorMessage(res, t("listFailed"))}
      />
    )
  }
  return (
    <WalletsView
      tab={tab} wallets={res.data.list_data} totalBalance={res.data.total_balance} errorMessage=""
    />
  )
}
