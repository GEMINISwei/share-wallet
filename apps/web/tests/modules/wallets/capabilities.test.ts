import { describe, expect, it } from "vitest"
import {
  adminsSummary, groupCategories, isLastAdmin, memberActions, walletSections,
} from "@/modules/wallets/capabilities"
import type { CategoryInfo, MemberInfo, WalletInfo } from "@/modules/wallets/types"

function wallet(overrides: Partial<WalletInfo>): WalletInfo {
  return {
    id: "w-1", kind: "general", name: "家用", balance: 0, destination: null,
    start_date: null, end_date: null, created_at: "2026-10-17T00:00:00Z",
    my_role: "member", can_manage: false, ...overrides,
  }
}

const ALICE: MemberInfo = { user_id: "alice", nickname: "Alice", role: "admin" }
const BOB: MemberInfo = { user_id: "bob", nickname: "Bob", role: "member" }
const CAROL_ADMIN: MemberInfo = { user_id: "carol", nickname: "Carol", role: "admin" }

describe("walletSections", () => {
  it("成員看不到管理操作", () => {
    expect(walletSections(wallet({ can_manage: false })).settings).toBe(false)
  })

  it("管理者（含沒有加入的超級管理者）看得到設定", () => {
    expect(walletSections(wallet({ my_role: "admin", can_manage: true })).settings).toBe(true)
    expect(walletSections(wallet({ my_role: null, can_manage: true })).settings).toBe(true)
  })

  it("只有一般錢包有分類", () => {
    expect(walletSections(wallet({ kind: "general" })).categories).toBe(true)
    expect(walletSections(wallet({ kind: "travel" })).categories).toBe(false)
  })
})

describe("memberActions", () => {
  const admin = { userId: "alice", canManage: true }
  const member = { userId: "bob", canManage: false }

  it("成員看不到管理操作", () => {
    expect(memberActions(ALICE, [ALICE, BOB], member)).toEqual({
      promote: false, demote: false, remove: false, leave: false,
    })
  })

  it("自己顯示離開，別人顯示移除", () => {
    expect(memberActions(BOB, [ALICE, BOB], member).leave).toBe(true)
    expect(memberActions(BOB, [ALICE, BOB], admin)).toMatchObject({ remove: true, leave: false })
  })

  it("管理者可以把成員升為管理者", () => {
    expect(memberActions(BOB, [ALICE, BOB], admin).promote).toBe(true)
    expect(memberActions(CAROL_ADMIN, [ALICE, CAROL_ADMIN], admin).promote).toBe(false)
  })

  it("最後一位管理者不能降級或離開", () => {
    expect(memberActions(ALICE, [ALICE, BOB], admin)).toMatchObject({ demote: false, leave: false })
  })

  it("還有別的管理者時可以降級或離開", () => {
    expect(memberActions(ALICE, [ALICE, CAROL_ADMIN], admin)).toMatchObject({
      demote: true, leave: true,
    })
  })

  it("沒有加入的超級管理者也不能移除最後一位管理者", () => {
    const outsider = { userId: "super", canManage: true }
    expect(memberActions(ALICE, [ALICE, BOB], outsider))
      .toMatchObject({ remove: false, demote: false })
  })
})

describe("isLastAdmin", () => {
  it("成員永遠不是最後一位管理者", () => {
    expect(isLastAdmin(BOB, [BOB])).toBe(false)
  })
})

describe("groupCategories", () => {
  it("依類型分組並保留原本的順序", () => {
    const categories: CategoryInfo[] = [
      { id: "1", type: "expense", name: "餐飲" },
      { id: "2", type: "income", name: "薪資" },
      { id: "3", type: "expense", name: "交通" },
    ]
    const grouped = groupCategories(categories)
    expect(grouped.expense.map((category) => category.name)).toEqual(["餐飲", "交通"])
    expect(grouped.income.map((category) => category.name)).toEqual(["薪資"])
  })
})

describe("adminsSummary", () => {
  it("管理者超過一位時顯示第一位與人數", () => {
    const admins = [
      { user_id: "a", nickname: "Alice" },
      { user_id: "b", nickname: "Bob" },
      { user_id: "c", nickname: "Carol" },
    ]
    expect(adminsSummary(admins)).toEqual({ first: "Alice", count: 3, more: 2 })
    expect(adminsSummary(admins.slice(0, 1))).toEqual({ first: "Alice", count: 1, more: 0 })
  })
})
