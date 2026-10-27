import { invitePath, withInvite } from "@/modules/wallets/public.client"
import { LOGIN_PATH } from "@/shared/session/login-contract"
import { SIGNUP_PATH } from "./constants"

/**
 * 登入、註冊完成後去哪裡, 以及兩頁互相連結的網址。帶著邀請時一路保留 token,
 * 最後停在確認頁 (見 docs/features/members.md〈加入流程〉)。`invite` 要先經過 `parseInviteToken`。
 */
export function authDestinations(invite: string | undefined) {
  return {
    afterAuth: invite ? invitePath(invite) : "/",
    login: withInvite(LOGIN_PATH, invite),
    signup: withInvite(SIGNUP_PATH, invite),
  }
}
