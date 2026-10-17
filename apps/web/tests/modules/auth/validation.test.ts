import { describe, expect, it } from "vitest"
import { getLoginRedirectReason, validateSignupValues } from "@/modules/auth/validation"

describe("getLoginRedirectReason", () => {
  it("認得約定裡的導向原因", () => {
    expect(getLoginRedirectReason("session-expired")).toBe("session-expired")
  })

  it("不認得的值、陣列與缺值一律當成沒有原因", () => {
    // query 參數是使用者可以亂改的, 不認得的值不能變成畫面上的提示。
    expect(getLoginRedirectReason("bogus")).toBeUndefined()
    expect(getLoginRedirectReason(["session-expired"])).toBeUndefined()
    expect(getLoginRedirectReason(undefined)).toBeUndefined()
  })
})

describe("validateSignupValues", () => {
  const filled = { nickname: "Newbie", username: "newbie", password: "new-password" }

  it("填齊暱稱、帳號與合格的密碼就沒有錯誤（不需要註冊代碼）", () => {
    expect(Object.values(validateSignupValues(filled, "zh")).filter(Boolean)).toEqual([])
  })

  it("空白的暱稱與帳號擋下來", () => {
    const errors = validateSignupValues({ ...filled, nickname: " ", username: "" }, "zh")

    expect(errors.nickname).toBeTruthy()
    expect(errors.username).toBeTruthy()
  })
})
