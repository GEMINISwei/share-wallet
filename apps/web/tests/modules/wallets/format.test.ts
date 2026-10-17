import { describe, expect, it } from "vitest"
import { formatAmount } from "@/modules/wallets/format"

describe("formatAmount", () => {
  it("金額加上千分位", () => {
    expect(formatAmount(1234567, "zh")).toBe("1,234,567")
    expect(formatAmount(-1200, "en")).toBe("-1,200")
  })
})
