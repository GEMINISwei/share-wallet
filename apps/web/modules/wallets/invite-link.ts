/**
 * 邀請連結的網址。登入、註冊頁 (auth 模組) 也要依 token 組出確認頁, 所以從 public.client 交出去。
 *
 * `invite` 參數只帶 token, 不帶導向網址 (見 docs/features.md〈加入流程〉): 由這裡把 token
 * 組成站內路徑, 參數就不可能被拿來導到別的網站。
 */

const INVITE_PATH = "/invite"

// 後端是 `secrets.token_urlsafe(32)` (43 字元)。只放行 base64url 字元, 斜線、冒號、問號
// 這些能組成網址的字元一律擋掉; 長度留一點餘裕, 後端改長度時前端不必同步。
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/

/** query 參數可能是任意值或陣列, 不是 token 格式就當作沒有。 */
export function parseInviteToken(value: string | string[] | undefined) {
  return typeof value === "string" && TOKEN_PATTERN.test(value) ? value : undefined
}

export function invitePath(token: string) {
  return `${INVITE_PATH}/${token}`
}

export function withInvite(path: string, token: string | undefined) {
  return token ? `${path}?${new URLSearchParams({ invite: token })}` : path
}
