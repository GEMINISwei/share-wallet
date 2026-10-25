import { describe, expect, it } from "vitest"
import { inviteSummary } from "@/modules/wallets/invite-summary"
import type { InvitePreview } from "@/modules/wallets/types"

const general: InvitePreview = {
  wallet_id: "w1", kind: "general", name: "家用", destination: null,
  start_date: null, end_date: null, member_count: 3, is_member: false,
}

describe("確認頁的錢包摘要", () => {
  it("一般錢包顯示類型與成員數", () => {
    expect(inviteSummary(general, "zh")).toBe("一般錢包 · 3 位成員")
  })

  it("旅遊錢包另外顯示目的地與日期", () => {
    const travel: InvitePreview = {
      ...general, kind: "travel", destination: "東京",
      start_date: "2026-11-01", end_date: "2026-11-05",
    }
    expect(inviteSummary(travel, "en")).toBe(
      "Travel wallet · 東京 · 2026-11-01 – 2026-11-05 · 3 members",
    )
  })
})
