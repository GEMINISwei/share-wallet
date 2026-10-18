import { describe, expect, it } from "vitest"
import {
  canConfirmDelete, hasErrors, parseAmount, parsePositiveAmount, toAdjustRequest,
  toAdminCreateRequest, toCreateRequest, toEntryRequest, toUpdateRequest, validateAdjustForm,
  validateAdminUser, validateEntryForm, validateWalletForm,
} from "@/modules/wallets/validation"
import type { AdjustFormValues, EntryFormValues, WalletFormValues } from "@/modules/wallets/types"

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

describe("後台建立錢包", () => {
  it("沒有選管理者時回傳錯誤", () => {
    expect(validateAdminUser("", "zh")).toBe("請選擇管理者")
    expect(validateAdminUser("u-1", "zh")).toBeUndefined()
  })

  it("請求帶上指定的管理者", () => {
    expect(toAdminCreateRequest(GENERAL, "u-1")).toEqual({
      kind: "general", name: "家用", initial_balance: 0, admin_user_id: "u-1",
    })
  })
})

const ENTRY: EntryFormValues = {
  kind: "expense", amount: "1,200", category_id: "food", entry_date: "2026-10-18", note: " 午餐 ",
}

describe("validateEntryForm", () => {
  it("金額要是正整數", () => {
    for (const amount of ["", "0", "-5", "1.5", "abc"]) {
      expect(parsePositiveAmount(amount)).toBeNull()
      expect(validateEntryForm({ ...ENTRY, amount }, "zh").amount).toBe("請輸入大於 0 的整數金額")
    }
    expect(parsePositiveAmount("1,200")).toBe(1200)
  })

  it("分類與日期必填", () => {
    const errors = validateEntryForm({ ...ENTRY, category_id: "", entry_date: "" }, "zh")
    expect(errors.category_id).toBe("請選擇分類")
    expect(errors.entry_date).toBe("請選擇日期")
  })

  it("備註最多 200 字", () => {
    expect(validateEntryForm({ ...ENTRY, note: "字".repeat(200) }, "zh").note).toBeUndefined()
    expect(validateEntryForm({ ...ENTRY, note: "字".repeat(201) }, "zh").note).toBe("備註最多 200 字")
    // emoji 在 JS 的 length 是 2, 後端以字元計。
    expect(validateEntryForm({ ...ENTRY, note: "🍜".repeat(200) }, "zh").note).toBeUndefined()
  })

  it("通過驗證的表單轉成請求", () => {
    expect(hasErrors(validateEntryForm(ENTRY, "zh"))).toBe(false)
    expect(toEntryRequest(ENTRY)).toEqual({
      kind: "expense", amount: 1200, category_id: "food", entry_date: "2026-10-18", note: "午餐",
    })
  })
})

describe("validateAdjustForm", () => {
  const ADJUST: AdjustFormValues = { balance: "-300", entry_date: "2026-10-18", note: "" }

  it("實際餘額可以是 0 或負數", () => {
    expect(hasErrors(validateAdjustForm(ADJUST, "zh"))).toBe(false)
    expect(hasErrors(validateAdjustForm({ ...ADJUST, balance: "0" }, "zh"))).toBe(false)
    expect(toAdjustRequest(ADJUST)).toEqual({ balance: -300, entry_date: "2026-10-18", note: "" })
  })

  it("實際餘額要填整數", () => {
    expect(validateAdjustForm({ ...ADJUST, balance: " " }, "zh").balance).toBe("請輸入實際餘額")
    expect(validateAdjustForm({ ...ADJUST, balance: "1.5" }, "zh").balance).toBe("請輸入整數金額")
  })
})
