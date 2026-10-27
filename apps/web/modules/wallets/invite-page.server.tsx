import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { apiGet } from "@/shared/api/request.server"
import { getApiItemData } from "@/shared/api/response"
import { getLocale, getT } from "@/shared/i18n/locale.server"
import { ACCESS_TOKEN_COOKIE, LOGIN_PATH } from "@/shared/session/login-contract"
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
 * 邀請連結的確認頁 (見 docs/features/members.md〈加入流程〉)。不在受保護路由裡: 沒登入的人要帶著
 * token 導到登入頁, 而 proxy 的保護只會導到不帶參數的 `/login`。登入檢查在這裡自己做。
 */
export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params
  // 先看 cookie 而不是問後端「我是誰」: 沒有 token 時 shared 的請求層會直接導到不帶參數的
  // 登入頁, invite 就丟了。cookie 在但 token 已失效 (停用、強制登出) 時仍會被那樣導走,
  // cookie 與 token 同壽命, 這種情況少見, 重新點一次連結即可。
  if (!(await cookies()).get(ACCESS_TOKEN_COOKIE)?.value) {
    redirect(withInvite(LOGIN_PATH, token))
  }

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
