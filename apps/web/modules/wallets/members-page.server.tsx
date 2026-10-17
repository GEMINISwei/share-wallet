import "server-only"
import { getCurrentUser } from "@/modules/auth/public.server"
import { apiGet } from "@/shared/api/request.server"
import { getApiListData } from "@/shared/api/response"
import { getT } from "@/shared/i18n/locale.server"
import { walletsMessages } from "./i18n"
import { loadWallet, type WalletPageProps } from "./wallet.server"
import MembersView from "./ui/MembersView"
import WalletNotFound from "./ui/WalletNotFound"

export async function generateMetadata() {
  return { title: (await getT(walletsMessages))("members") }
}

export default async function WalletMembersPage({ params }: WalletPageProps) {
  const { id } = await params
  const [wallet, membersRes, currentUser, t] = await Promise.all([
    loadWallet(id),
    apiGet({ url: "/wallets/{id}/members", params: { id } }),
    getCurrentUser(),
    getT(walletsMessages),
  ])
  if (!wallet) return <WalletNotFound />
  return (
    <MembersView
      wallet={wallet}
      members={getApiListData(membersRes)}
      currentUserId={currentUser.data?.id ?? ""}
      errorMessage={membersRes.status === "success" ? "" : t("membersFailed")}
    />
  )
}
