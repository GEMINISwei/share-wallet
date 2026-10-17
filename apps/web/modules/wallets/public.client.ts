/**
 * wallets 的 Client 公開面 (不含 server-only)。
 *
 * 登入、註冊頁收到 `?invite=` 時, 要驗證 token 並在完成後導到確認頁, 規則只在這裡一份。
 */

export { invitePath, parseInviteToken, withInvite } from "./invite-link"
