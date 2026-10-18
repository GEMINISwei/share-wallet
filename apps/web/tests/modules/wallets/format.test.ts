import { describe, expect, it } from "vitest"
import {
  counterpartName, entryTitle, formatAmount, formatEntryDate, localToday, signedAmount,
  snapshotField, snapshotSummaryFields,
} from "@/modules/wallets/format"

describe("formatAmount", () => {
  it("金額加上千分位", () => {
    expect(formatAmount(1234567, "zh")).toBe("1,234,567")
    expect(formatAmount(-1200, "en")).toBe("-1,200")
  })
})

describe("signedAmount", () => {
  it("帳目金額依收支與調整顯示正負號", () => {
    expect(signedAmount("income", 500)).toBe(500)
    expect(signedAmount("expense", 300)).toBe(-300)
    expect(signedAmount("adjustment", -250)).toBe(-250)
  })

  it("轉出顯示負號、轉入顯示正號", () => {
    expect(signedAmount("transfer_out", 300)).toBe(-300)
    expect(signedAmount("transfer_in", 300)).toBe(300)
  })
})

describe("localToday", () => {
  it("用本地時區的年月日，不是 UTC", () => {
    expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05")
  })
})

describe("formatEntryDate", () => {
  it("帳目日期照原樣的年月日顯示", () => {
    expect(formatEntryDate("2026-10-18", "en")).toBe("Oct 18, 2026")
  })
})

describe("snapshotField", () => {
  const snapshot = {
    kind: "adjustment", amount: -250, category_name: null, entry_date: "2026-10-18", note: "",
  } as const

  it("異動紀錄的欄位名稱與值，空的顯示（無）", () => {
    expect(snapshotField("kind", snapshot, "zh")).toEqual({ label: "類型", value: "調整餘額" })
    expect(snapshotField("amount", snapshot, "zh")).toEqual({ label: "金額", value: "-250" })
    expect(snapshotField("category_name", snapshot, "zh").value).toBe("（無）")
    expect(snapshotField("note", snapshot, "zh").value).toBe("（無）")
  })
})

describe("entryTitle", () => {
  const savings = { id: "w-2", name: "存款" }

  it("收支是分類、調整是調整餘額", () => {
    const food = { id: "food", name: "餐飲" }
    expect(entryTitle({ kind: "expense", category: food, counterpart_wallet: null }, "zh")).toBe("餐飲")
    expect(entryTitle({ kind: "adjustment", category: null, counterpart_wallet: null }, "zh"))
      .toBe("調整餘額")
  })

  it("轉帳顯示轉出至、轉入自對方錢包", () => {
    expect(entryTitle({ kind: "transfer_out", category: null, counterpart_wallet: savings }, "zh"))
      .toBe("轉出至 存款")
    expect(entryTitle({ kind: "transfer_in", category: null, counterpart_wallet: savings }, "en"))
      .toBe("From 存款")
  })

  it("對方錢包已刪除時顯示已刪除的錢包", () => {
    expect(entryTitle({ kind: "transfer_in", category: null, counterpart_wallet: null }, "zh"))
      .toBe("轉入自 已刪除的錢包")
  })
})

describe("counterpartName", () => {
  it("只有轉帳有對方錢包，已刪除時顯示已刪除的錢包", () => {
    expect(counterpartName("expense", null, "zh")).toBeNull()
    expect(counterpartName("transfer_out", "存款", "zh")).toBe("存款")
    expect(counterpartName("transfer_out", null, "zh")).toBe("已刪除的錢包")
  })
})

describe("snapshotSummaryFields", () => {
  const base = { amount: 300, category_name: null, entry_date: "2026-10-18", note: "" }

  it("收支列分類、轉帳列對方錢包、調整兩個都不列", () => {
    expect(snapshotSummaryFields({ ...base, kind: "expense", category_name: "餐飲" }))
      .toEqual(["kind", "category_name", "amount", "entry_date"])
    expect(snapshotSummaryFields({ ...base, kind: "transfer_in", counterpart_wallet_name: "存款" }))
      .toEqual(["kind", "counterpart_wallet_name", "amount", "entry_date"])
    expect(snapshotSummaryFields({ ...base, kind: "adjustment", note: "盤點" }))
      .toEqual(["kind", "amount", "entry_date", "note"])
  })

  it("轉帳紀錄的對方錢包", () => {
    const snapshot = { ...base, kind: "transfer_out", counterpart_wallet_name: "存款" } as const
    expect(snapshotField("counterpart_wallet_name", snapshot, "zh"))
      .toEqual({ label: "對方錢包", value: "存款" })
  })
})

describe("代墊與還款的顯示", () => {
  const none = { category: null, counterpart_wallet: null }

  it("代墊扣餘額、還款加回", () => {
    expect(signedAmount("advance", 500)).toBe(-500)
    expect(signedAmount("repayment", 200)).toBe(200)
  })

  it("列表標題寫出對象", () => {
    expect(entryTitle({ ...none, kind: "advance", advance_target_name: "小明" }, "zh"))
      .toBe("代墊給 小明")
    expect(entryTitle({ ...none, kind: "repayment", advance_target_name: "小明" }, "zh"))
      .toBe("小明 還款")
    expect(entryTitle({ ...none, kind: "advance", advance_target_name: "Amy" }, "en"))
      .toBe("Advance to Amy")
  })

  it("異動紀錄列出對象", () => {
    const snapshot = {
      kind: "repayment", amount: 200, category_name: null, advance_target_name: "小明",
      entry_date: "2026-10-18", note: "",
    } as const
    expect(snapshotSummaryFields(snapshot))
      .toEqual(["kind", "advance_target_name", "amount", "entry_date"])
    expect(snapshotField("advance_target_name", snapshot, "zh"))
      .toEqual({ label: "對象", value: "小明" })
    expect(snapshotField("kind", snapshot, "zh").value).toBe("還款")
  })
})
