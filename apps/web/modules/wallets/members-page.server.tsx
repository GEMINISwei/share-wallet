import "server-only"
import { getCurrentUser } from "@/modules/auth/public.server"
import { apiGet } from "@/shared/api/request.server"
import { getApiListData } from "@/shared/api/response"
import { getT } from "@/shared/i18n/locale.server"
import { walletsMessages } from "./i18n"
import type { WalletArea } from "./paths"
import { loadWallet, type WalletPageProps } from "./wallet.server"
import MembersView from "./ui/MembersView"
import WalletNotFound from "./ui/WalletNotFound"

export async function generateMetadata() {
  return { title: (await getT(walletsMessages))("members") }
}

async function renderMembersPage({ params }: WalletPageProps, area: WalletArea) {
  const { id } = await params
  const [wallet, membersRes, currentUser, t] = await Promise.all([
    loadWallet(id),
    apiGet({ url: "/wallets/{id}/members", params: { id } }),
    getCurrentUser(),
    getT(walletsMessages),
  ])
  if (!wallet) return <WalletNotFound area={area} />
  return (
    <MembersView
      wallet={wallet}
      area={area}
      members={getApiListData(membersRes)}
      currentUserId={currentUser.data?.id ?? ""}
      errorMessage={membersRes.status === "success" ? "" : t("membersFailed")}
    />
  )
}

export default async function WalletMembersPage(props: WalletPageProps) {
  return renderMembersPage(props, "user")
}

export async function AdminWalletMembersPage(props: WalletPageProps) {
  return renderMembersPage(props, "admin")
}
