import { describe, expect, it } from "vitest"
import {
  formatAmount, formatEntryDate, localToday, signedAmount, snapshotField,
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
    expect(snapshotField("kind", snapshot, "zh")).toEqual({ label: "收支", value: "調整餘額" })
    expect(snapshotField("amount", snapshot, "zh")).toEqual({ label: "金額", value: "-250" })
    expect(snapshotField("category_name", snapshot, "zh").value).toBe("（無）")
    expect(snapshotField("note", snapshot, "zh").value).toBe("（無）")
  })
})
