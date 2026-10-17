import "server-only"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/modules/auth/public.server"
import { apiGet } from "@/shared/api/request.server"
import { getApiItemData } from "@/shared/api/response"
import { getLocale, getT } from "@/shared/i18n/locale.server"
import { LOGIN_PATH } from "@/shared/session/login-contract"
import { MessagePage, MessagePageLink } from "@/shared/ui"
import { walletsMessages } from "./i18n"
import { withInvite } from "./invite-link"
import { inviteSummary } from "./invite-summary"
import { WALLETS_PATH } from "./manifest"
import InviteView from "./ui/InviteView"

export async function generateMetadata() {
  return { title: (await getT(walletsMessages))("joinPageTitle") }
}

export type InvitePageProps = {
  params: Promise<{ token: string }>
}

/**
 * 邀請連結的確認頁 (見 docs/features.md〈加入流程〉)。不在受保護路由裡: 沒登入的人要帶著
 * token 導到登入頁, 而 proxy 的保護只會導到不帶參數的 `/login`。
 */
export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params
  const { data: user } = await getCurrentUser()
  if (!user) redirect(withInvite(LOGIN_PATH, token))

  const [res, t, locale] = await Promise.all([
    apiGet({ url: "/invites/{token}", params: { token } }),
    getT(walletsMessages),
    getLocale(),
  ])
  const preview = getApiItemData(res)
  // 過期、撤銷、錢包已刪除都是同一頁, 不分辨是哪一種 (後端也一律 404)。
  if (!preview) {
    return (
      <MessagePage title={t("inviteInvalidTitle")} description={t("inviteInvalid")}>
        <MessagePageLink href={WALLETS_PATH}>{t("goToWallets")}</MessagePageLink>
      </MessagePage>
    )
  }
  return <InviteView token={token} preview={preview} summary={inviteSummary(preview, locale)} />
}
