import { describe, expect, it } from "vitest"
import {
  canConfirmDelete, hasErrors, parseAmount, shareRemainder, toExpenseRequest,
  validateExpenseForm, parsePositiveAmount, toAdjustRequest,
  toAdminCreateRequest, toAdvanceRequest, toCreateRequest, toEntryRequest, toMoneyRequest,
  toTransferRequest, toTransferUpdateRequest, toUpdateRequest, validateAdjustForm,
  validateAdminUser, validateEntryForm, validateRepayForm, validateWalletForm,
} from "@/modules/wallets/validation"
import type {
  AdjustFormValues, EntryFormValues, ExpenseFormValues, RepayFormValues, WalletFormValues,
} from "@/modules/wallets/types"

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

const ENTRY = {
  kind: "expense", amount: "1,200", category_id: "food", counterpart_wallet_id: "", target_name: "",
  entry_date: "2026-10-18", note: " 午餐 ",
} satisfies EntryFormValues

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

describe("validateEntryForm (轉帳)", () => {
  const TRANSFER = {
    ...ENTRY, kind: "transfer_out", category_id: "", counterpart_wallet_id: "w-2",
  } satisfies EntryFormValues

  it("轉帳要選對方錢包，不用選分類", () => {
    expect(hasErrors(validateEntryForm(TRANSFER, "zh"))).toBe(false)
    const errors = validateEntryForm({ ...TRANSFER, counterpart_wallet_id: "" }, "zh")
    expect(errors.counterpart_wallet_id).toBe("請選擇對方錢包")
    expect(errors.category_id).toBeUndefined()
    expect(validateEntryForm(ENTRY, "zh").counterpart_wallet_id).toBeUndefined()
  })

  it("建立轉帳的請求帶對方錢包，修改只帶金額、日期、備註", () => {
    expect(toTransferRequest(TRANSFER)).toEqual({
      kind: "transfer_out", counterpart_wallet_id: "w-2", amount: 1200,
      entry_date: "2026-10-18", note: "午餐",
    })
    expect(toTransferUpdateRequest(TRANSFER)).toEqual({
      amount: 1200, entry_date: "2026-10-18", note: "午餐",
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

describe("validateEntryForm (代墊)", () => {
  const ADVANCE = { ...ENTRY, kind: "advance", category_id: "", target_name: " 小明 " } satisfies EntryFormValues

  it("代墊要填對象，不用選分類", () => {
    expect(hasErrors(validateEntryForm(ADVANCE, "zh"))).toBe(false)
    const errors = validateEntryForm({ ...ADVANCE, target_name: "  " }, "zh")
    expect(errors.target_name).toBe("請輸入對象")
    expect(errors.category_id).toBeUndefined()
    expect(validateEntryForm(ENTRY, "zh").target_name).toBeUndefined()
  })

  it("對象最多 20 字", () => {
    expect(validateEntryForm({ ...ADVANCE, target_name: "字".repeat(20) }, "zh").target_name)
      .toBeUndefined()
    expect(validateEntryForm({ ...ADVANCE, target_name: "字".repeat(21) }, "zh").target_name)
      .toBe("對象最多 20 字")
  })

  it("建立代墊的請求帶對象，修改只帶金額、日期、備註", () => {
    expect(toAdvanceRequest(ADVANCE)).toEqual({
      target_name: "小明", amount: 1200, entry_date: "2026-10-18", note: "午餐",
    })
    expect(toMoneyRequest(ADVANCE)).toEqual({ amount: 1200, entry_date: "2026-10-18", note: "午餐" })
  })
})

describe("validateRepayForm", () => {
  const REPAY: RepayFormValues = { amount: "300", entry_date: "2026-10-18", note: "" }

  it("還款不可超過未還金額", () => {
    expect(hasErrors(validateRepayForm(REPAY, 300, "zh"))).toBe(false)
    expect(validateRepayForm({ ...REPAY, amount: "301" }, 300, "zh").amount)
      .toBe("還款不可超過未還金額 300")
  })

  it("修改還款時上限交給後端檢查", () => {
    expect(hasErrors(validateRepayForm({ ...REPAY, amount: "99999" }, null, "zh"))).toBe(false)
  })

  it("金額要是正整數、日期必填", () => {
    const errors = validateRepayForm({ ...REPAY, amount: "0", entry_date: "" }, 300, "zh")
    expect(errors.amount).toBe("請輸入大於 0 的整數金額")
    expect(errors.entry_date).toBe("請選擇日期")
    expect(toMoneyRequest({ ...REPAY, note: " 現金 " }))
      .toEqual({ amount: 300, entry_date: "2026-10-18", note: "現金" })
  })
})

describe("validateExpenseForm", () => {
  const equal: ExpenseFormValues = {
    amount: "1,000", payer_id: "alice", split_mode: "equal", participant_ids: ["alice", "bob"],
    shares: [], entry_date: "2026-11-02", note: "",
  }
  const custom: ExpenseFormValues = {
    ...equal, split_mode: "custom", participant_ids: [],
    shares: [
      { key: "1", user_id: "alice", amount: "600" },
      { key: "2", user_id: "bob", amount: "400" },
    ],
  }

  it("均分、指定金額填好時沒有錯誤", () => {
    expect(hasErrors(validateExpenseForm(equal, "zh"))).toBe(false)
    expect(hasErrors(validateExpenseForm(custom, "zh"))).toBe(false)
  })

  it("金額要大於 0、要選付款人與日期", () => {
    const errors = validateExpenseForm({ ...equal, amount: "0", payer_id: "", entry_date: "" }, "zh")
    expect(errors.amount).toBe("請輸入大於 0 的整數金額")
    expect(errors.payer_id).toBe("請選擇付款人")
    expect(errors.entry_date).toBe("請選擇日期")
  })

  it("均分至少要勾一個人", () => {
    expect(validateExpenseForm({ ...equal, participant_ids: [] }, "zh").participant_ids)
      .toBe("請選擇分攤對象")
  })

  it("指定金額至少要有一列", () => {
    expect(validateExpenseForm({ ...custom, shares: [] }, "zh").shares).toBe("請新增分攤對象")
  })

  it("指定金額每一列都要選人", () => {
    const shares = [{ key: "1", user_id: "", amount: "1000" }]
    expect(validateExpenseForm({ ...custom, shares }, "zh").shares).toBe("每一列都要選人")
  })

  it("指定金額每一列的金額要大於 0", () => {
    const shares = [...custom.shares, { key: "3", user_id: "carol", amount: "0" }]
    expect(validateExpenseForm({ ...custom, shares }, "zh").shares).toBe("每人的金額要大於 0")
  })

  it("指定金額同一個人不能出現兩次", () => {
    const shares = custom.shares.map((share) => ({ ...share, user_id: "alice" }))
    expect(validateExpenseForm({ ...custom, shares }, "zh").shares).toBe("同一個人不能出現兩次")
  })

  it("指定金額加總不等於總額時顯示差多少", () => {
    const shares = [custom.shares[0], { ...custom.shares[1], amount: "300" }]
    expect(validateExpenseForm({ ...custom, shares }, "zh").shares)
      .toBe("分攤加總 900，與總額 1,000 不符")
  })

  it("切到指定金額時不檢查均分的勾選", () => {
    expect(validateExpenseForm(custom, "zh").participant_ids).toBeUndefined()
  })
})

describe("shareRemainder", () => {
  it("總額減去已填的分攤，空白的列不算", () => {
    expect(shareRemainder("1,000", [
      { key: "1", user_id: "alice", amount: "600" },
      { key: "2", user_id: "bob", amount: "" },
    ])).toBe(400)
  })

  it("總額或任何一列不是整數時是 null", () => {
    expect(shareRemainder("", [])).toBeNull()
    expect(shareRemainder("100", [{ key: "1", user_id: "a", amount: "1.5" }])).toBeNull()
  })
})

describe("toExpenseRequest", () => {
  it("均分送分攤對象，依加入順序", () => {
    const values: ExpenseFormValues = {
      amount: "1,000", payer_id: "alice", split_mode: "equal", participant_ids: ["bob", "alice"],
      shares: [{ key: "1", user_id: "carol", amount: "5" }], entry_date: "2026-11-02",
      note: " 晚餐 ",
    }
    expect(toExpenseRequest(values)).toEqual({
      split_mode: "equal", amount: 1000, payer_id: "alice", participant_ids: ["bob", "alice"],
      entry_date: "2026-11-02", note: "晚餐",
    })
  })

  it("指定金額依表上的順序送每一列", () => {
    const values: ExpenseFormValues = {
      amount: "100", payer_id: "bob", split_mode: "custom", participant_ids: ["alice"],
      shares: [
        { key: "2", user_id: "carol", amount: "70" },
        { key: "1", user_id: "alice", amount: "30" },
      ],
      entry_date: "2026-11-02", note: "",
    }
    expect(toExpenseRequest(values)).toEqual({
      split_mode: "custom", amount: 100, payer_id: "bob",
      shares: [{ user_id: "carol", amount: 70 }, { user_id: "alice", amount: 30 }],
      entry_date: "2026-11-02", note: "",
    })
  })
})
