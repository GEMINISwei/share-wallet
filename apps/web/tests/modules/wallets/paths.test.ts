import { describe, expect, it } from "vitest"
import {
  addEntryPath, walletBackPath, walletCategoriesPath, walletGroupPath, walletMembersPath,
  walletPath, walletSettingsPath, walletsListPath, wantsAddEntry,
} from "@/modules/wallets/paths"
import type { WalletInfo } from "@/modules/wallets/types"

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
  it("旅遊錢包帶上類型, 進到第一個旅遊群組", () => {
    expect(walletsListPath("user", "travel")).toBe("/wallets?kind=travel")
    // 一般是預設, 不帶參數。
    expect(walletsListPath("user", "general")).toBe("/wallets")
  })

  it("後台列表沒有群組, 不帶參數", () => {
    expect(walletsListPath("admin", "travel")).toBe("/admin/wallets")
  })
})

describe("walletGroupPath", () => {
  it("群組頁在使用者區的錢包底下", () => {
    expect(walletGroupPath("g1")).toBe("/wallets/groups/g1")
  })
})

describe("walletBackPath", () => {
  const wallet = (overrides: Partial<WalletInfo>) => ({
    id: "w1", kind: "general", group_id: "g1", ...overrides,
  }) as WalletInfo

  it("使用者區回到這個錢包所在的群組", () => {
    expect(walletBackPath(wallet({}), "user")).toBe("/wallets/groups/g1")
  })

  it("沒加入的錢包 (超級管理者) 沒有群組, 回到同類型的第一個群組", () => {
    expect(walletBackPath(wallet({ kind: "travel", group_id: null }), "user"))
      .toBe("/wallets?kind=travel")
  })

  it("後台一律回到後台的列表", () => {
    expect(walletBackPath(wallet({}), "admin")).toBe("/admin/wallets")
  })
})

describe("addEntryPath", () => {
  it("錢包頁的網址帶上 add=1, 打開時直接記一筆", () => {
    expect(addEntryPath("w1")).toBe("/wallets/w1?add=1")
  })

  it("只有 add=1 才算要記一筆", () => {
    expect(wantsAddEntry("1")).toBe(true)
    expect(wantsAddEntry(undefined)).toBe(false)
    expect(wantsAddEntry("yes")).toBe(false)
  })
})
