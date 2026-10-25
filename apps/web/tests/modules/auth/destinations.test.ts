import { describe, expect, it } from "vitest"
import { authDestinations } from "@/modules/auth/destinations"

const TOKEN = "Xq3_k9-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"

describe("登入、註冊後的去處", () => {
  it("帶 invite 時登入或註冊後導向確認頁", () => {
    expect(authDestinations(TOKEN).afterAuth).toBe(`/invite/${TOKEN}`)
  })

  it("沒有 invite 時登入或註冊後回首頁", () => {
    expect(authDestinations(undefined).afterAuth).toBe("/")
  })

  it("登入頁與註冊頁互相連結時保留 invite", () => {
    expect(authDestinations(TOKEN).login).toBe(`/login?invite=${TOKEN}`)
    expect(authDestinations(TOKEN).signup).toBe(`/signup?invite=${TOKEN}`)
    expect(authDestinations(undefined)).toMatchObject({ login: "/login", signup: "/signup" })
  })
})
