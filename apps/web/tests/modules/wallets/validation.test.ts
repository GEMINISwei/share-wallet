import { describe, expect, it } from "vitest"
import {
  canConfirmDelete, hasErrors, parseAmount, toCreateRequest, toUpdateRequest, validateWalletForm,
} from "@/modules/wallets/validation"
import type { WalletFormValues } from "@/modules/wallets/types"

const GENERAL: WalletFormValues = {
  kind: "general", name: "家用", initial_balance: "", destination: "", start_date: "", end_date: "",
}
const TRAVEL: WalletFormValues = {
  kind: "travel", name: "東京", initial_balance: "", destination: "日本",
  start_date: "2026-11-01", end_date: "2026-11-05",
}

describe("parseAmount", () => {
  it("空白視為 0", () => {
    expect(parseAmount("  ")).toBe(0)
  })

  it("接受負數與千分位", () => {
    expect(parseAmount("-1,200")).toBe(-1200)
  })

  it("小數、文字、超過安全範圍都不接受", () => {
    expect(parseAmount("1.5")).toBeNull()
    expect(parseAmount("abc")).toBeNull()
    expect(parseAmount(String(2 ** 53))).toBeNull()
  })
})

describe("validateWalletForm", () => {
  it("名稱只有空白時回傳錯誤", () => {
    expect(validateWalletForm({ ...GENERAL, name: "  " }, "zh").name).toBe("請輸入名稱")
  })

  it("初始餘額不是整數時回傳錯誤", () => {
    expect(validateWalletForm({ ...GENERAL, initial_balance: "1.5" }, "en").initial_balance)
      .toBe("Enter a whole number")
  })

  it("旅遊錢包要目的地與起訖日", () => {
    const errors = validateWalletForm({ ...TRAVEL, destination: " ", start_date: "" }, "zh")
    expect(errors.destination).toBe("請輸入目的地")
    expect(errors.start_date).toBe("請選擇日期")
  })

  it("結束日早於開始日時回傳錯誤", () => {
    expect(validateWalletForm({ ...TRAVEL, end_date: "2026-10-31" }, "zh").end_date)
      .toBe("結束日不可早於開始日")
  })

  it("結束日可以與開始日同一天", () => {
    expect(hasErrors(validateWalletForm({ ...TRAVEL, end_date: "2026-11-01" }, "zh"))).toBe(false)
  })
})

describe("toCreateRequest / toUpdateRequest", () => {
  it("一般錢包帶初始餘額，旅遊錢包帶目的地與日期", () => {
    expect(toCreateRequest({ ...GENERAL, name: " 家用 ", initial_balance: "-300" }))
      .toEqual({ kind: "general", name: "家用", initial_balance: -300 })
    expect(toCreateRequest(TRAVEL)).toEqual({
      kind: "travel", name: "東京", destination: "日本",
      start_date: "2026-11-01", end_date: "2026-11-05",
    })
  })

  it("修改一般錢包只送名稱", () => {
    expect(toUpdateRequest({ ...GENERAL, initial_balance: "500" }))
      .toEqual({ kind: "general", name: "家用" })
  })
})

describe("canConfirmDelete", () => {
  it("輸入的名稱與錢包名稱相同才能刪除", () => {
    expect(canConfirmDelete(" 家用 ", "家用")).toBe(true)
    expect(canConfirmDelete("家", "家用")).toBe(false)
  })
})
