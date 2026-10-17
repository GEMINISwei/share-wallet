import { describe, expect, it } from "vitest"
import { invitePath, parseInviteToken, withInvite } from "@/modules/wallets/invite-link"

// 後端用 `secrets.token_urlsafe(32)` 產生, 43 個 base64url 字元。
const TOKEN = "Xq3_k9-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"

describe("邀請 token", () => {
  it("合法的 token 原樣回傳", () => {
    expect(parseInviteToken(TOKEN)).toBe(TOKEN)
  })

  it("網址、路徑與其他不是 token 的值一律忽略（防 open redirect）", () => {
    for (const value of [
      "https://evil.example/phish", "//evil.example", "/admin/users", "../wallets",
      `${TOKEN}?next=/x`, "short", "", [TOKEN], undefined,
    ]) {
      expect(parseInviteToken(value)).toBeUndefined()
    }
  })

  it("確認頁網址由 token 組出", () => {
    expect(invitePath(TOKEN)).toBe(`/invite/${TOKEN}`)
  })

  it("帶 token 時網址加上 invite 參數，沒有時原樣回傳", () => {
    expect(withInvite("/login", TOKEN)).toBe(`/login?invite=${TOKEN}`)
    expect(withInvite("/login", undefined)).toBe("/login")
  })
})
