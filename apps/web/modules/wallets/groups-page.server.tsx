import "server-only"
import { apiGet } from "@/shared/api/request.server"
import { getApiResponseErrorMessage } from "@/shared/api/error"
import { getT } from "@/shared/i18n/locale.server"
import { walletsMessages } from "./i18n"
import WalletGroupsView from "./ui/WalletGroupsView"

export async function generateMetadata() {
  return { title: (await getT(walletsMessages))("walletSettingsTitle") }
}

/** 自己的錢包群組與每個錢包放在哪、要不要顯示 (見 docs/features/wallets.md〈錢包群組〉)。 */
export default async function WalletGroupsPage() {
  const t = await getT(walletsMessages)
  const [groupsRes, walletsRes] = await Promise.all([
    apiGet({ url: "/wallet-groups/" }),
    apiGet({ url: "/wallets/" }),
  ])
  if (groupsRes.status !== "success" || walletsRes.status !== "success") {
    const failed = groupsRes.status !== "success" ? groupsRes : walletsRes
    return (
      <WalletGroupsView
        groups={[]} wallets={[]} errorMessage={getApiResponseErrorMessage(failed, t("groupsFailed"))}
      />
    )
  }
  return (
    <WalletGroupsView
      groups={groupsRes.data.list_data} wallets={walletsRes.data.list_data} errorMessage=""
    />
  )
}
