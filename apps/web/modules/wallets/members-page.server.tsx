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
  // 邀請連結只有管理者看得到 (後端對成員回 403), 不是管理者就不必問。
  const inviteRes = wallet.can_manage
    ? await apiGet({ url: "/wallets/{id}/invite", params: { id } })
    : null
  return (
    <MembersView
      wallet={wallet}
      area={area}
      members={getApiListData(membersRes)}
      currentUserId={currentUser.data?.id ?? ""}
      errorMessage={membersRes.status === "success" ? "" : t("membersFailed")}
      invite={inviteRes?.status === "success" ? inviteRes.data.invite : null}
      inviteError={inviteRes && inviteRes.status !== "success" ? t("inviteLoadFailed") : ""}
    />
  )
}

export default async function WalletMembersPage(props: WalletPageProps) {
  return renderMembersPage(props, "user")
}

export async function AdminWalletMembersPage(props: WalletPageProps) {
  return renderMembersPage(props, "admin")
}
