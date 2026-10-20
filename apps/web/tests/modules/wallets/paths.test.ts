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

describe("walletsListPath", () => {
  it("帶上錢包類型的分頁參數", () => {
    expect(walletsListPath("user", "travel")).toBe("/wallets?tab=travel")
    // 一般是預設分頁, 不帶參數。
    expect(walletsListPath("user", "general")).toBe("/wallets")
  })

  it("後台列表沒有分頁, 不帶參數", () => {
    expect(walletsListPath("admin", "travel")).toBe("/admin/wallets")
  })
})
