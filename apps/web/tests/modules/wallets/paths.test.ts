import { describe, expect, it } from "vitest"
import {
  walletCategoriesPath, walletMembersPath, walletPath, walletSettingsPath, walletsListPath,
} from "@/modules/wallets/paths"

describe("錢包網址", () => {
  it("子頁網址以所在區域的列表路徑為前綴", () => {
    for (const area of ["user", "admin"] as const) {
      const list = walletsListPath(area)
      expect(walletPath("w1", area)).toBe(`${list}/w1`)
      expect(walletSettingsPath("w1", area)).toBe(`${list}/w1/settings`)
      expect(walletMembersPath("w1", area)).toBe(`${list}/w1/members`)
      expect(walletCategoriesPath("w1", area)).toBe(`${list}/w1/categories`)
    }
    expect(walletsListPath("user")).toBe("/wallets")
    expect(walletsListPath("admin")).toBe("/admin/wallets")
  })
})
