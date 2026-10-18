import { describe, expect, it } from "vitest"
import {
  adminsSummary, canRepay, canTransfer, changedFields, entryActions, entryCategoryOptions,
  entryKindOptions, expenseActions, expenseChangedFields, groupCategories, initialExpenseValues,
  isLastAdmin, memberActions, owingTargets, shareUserOptions, splitEqually, transferTargets,
  walletSections,
} from "@/modules/wallets/capabilities"
import type {
  CategoryInfo, EntryInfo, EntryLogInfo, EntrySnapshot, ExpenseInfo, ExpenseLogInfo,
  ExpenseSnapshot, MemberInfo, WalletInfo,
} from "@/modules/wallets/types"

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

  it("兩種錢包都有異動紀錄", () => {
    expect(walletSections(wallet({ kind: "general" })).history).toBe(true)
    expect(walletSections(wallet({ kind: "travel" })).history).toBe(true)
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

function entry(overrides: Partial<EntryInfo>): EntryInfo {
  return {
    id: "e-1", kind: "expense", amount: 300, category: { id: "food", name: "餐飲" },
    counterpart_wallet: null, advance_target_name: null, advance_id: null, outstanding: null,
    entry_date: "2026-10-18", note: "", created_by: { user_id: "bob", nickname: "Bob" },
    created_at: "2026-10-18T00:00:00Z", ...overrides,
  }
}

describe("entryActions", () => {
  it("自己的帳可以修改刪除", () => {
    expect(entryActions(entry({}), { userId: "bob", canManage: false })).toEqual({
      edit: true, delete: true,
    })
  })

  it("別人的帳只有管理者能改刪", () => {
    expect(entryActions(entry({}), { userId: "carol", canManage: false })).toEqual({
      edit: false, delete: false,
    })
    expect(entryActions(entry({}), { userId: "alice", canManage: true })).toEqual({
      edit: true, delete: true,
    })
  })

  it("調整只能刪不能改", () => {
    const adjustment = entry({ kind: "adjustment", amount: -50, category: null })
    expect(entryActions(adjustment, { userId: "bob", canManage: true })).toEqual({
      edit: false, delete: true,
    })
  })
})

describe("entryCategoryOptions", () => {
  const categories: CategoryInfo[] = [
    { id: "food", type: "expense", name: "餐飲" },
    { id: "salary", type: "income", name: "薪資" },
  ]

  it("只列這個類型的分類", () => {
    expect(entryCategoryOptions(categories, "income", null)).toEqual([{ id: "salary", name: "薪資" }])
  })

  it("修改時保留這筆原本的封存分類", () => {
    const archived = entry({ category: { id: "old", name: "舊分類" } })
    expect(entryCategoryOptions(categories, "expense", archived)).toEqual([
      { id: "food", name: "餐飲" }, { id: "old", name: "舊分類" },
    ])
  })

  it("換了類型就不留原本的分類", () => {
    const archived = entry({ category: { id: "old", name: "舊分類" } })
    expect(entryCategoryOptions(categories, "income", archived)).toEqual([{ id: "salary", name: "薪資" }])
  })
})

describe("changedFields", () => {
  const before: EntrySnapshot = {
    kind: "expense", amount: 300, category_name: "餐飲", entry_date: "2026-10-18", note: "",
  }
  function log(overrides: Partial<EntryLogInfo>): EntryLogInfo {
    return {
      id: "l-1", entry_id: "e-1", action: "update", actor: { user_id: "bob", nickname: "Bob" },
      as_super_admin: false, before, after: before, created_at: "2026-10-18T00:00:00Z", ...overrides,
    }
  }

  it("異動紀錄列出改了哪些欄位", () => {
    const after = { ...before, amount: 400, note: "午餐" }
    expect(changedFields(log({ after }))).toEqual(["amount", "note"])
  })

  it("新增與刪除沒有改前改後", () => {
    expect(changedFields(log({ action: "create", before: null }))).toEqual([])
    expect(changedFields(log({ action: "delete", after: null }))).toEqual([])
  })
})

const SAVINGS = { id: "w-2", name: "存款" }

describe("transferTargets", () => {
  it("對方錢包只列其他一般錢包，依列表順序", () => {
    const wallets = [
      wallet({ id: "w-1", name: "家用" }),
      wallet({ id: "w-3", name: "旅遊", kind: "travel" }),
      wallet({ id: "w-2", name: "存款" }),
    ]
    expect(transferTargets(wallets, "w-1")).toEqual([SAVINGS])
  })
})

describe("canTransfer", () => {
  it("沒加入這個錢包（超級管理者）或沒有對象時不能轉帳", () => {
    expect(canTransfer(wallet({ my_role: "member" }), [SAVINGS])).toBe(true)
    expect(canTransfer(wallet({ my_role: null, can_manage: true }), [SAVINGS])).toBe(false)
    expect(canTransfer(wallet({ my_role: "admin" }), [])).toBe(false)
  })
})

describe("entryKindOptions", () => {
  it("記一筆時可以轉帳才列出轉出與轉入，代墊一律列出", () => {
    expect(entryKindOptions(null, true))
      .toEqual(["expense", "income", "advance", "transfer_out", "transfer_in"])
    expect(entryKindOptions(null, false)).toEqual(["expense", "income", "advance"])
  })

  it("修改代墊不能切換類型", () => {
    const advance = entry({ kind: "advance", category: null, advance_target_name: "小明", outstanding: 500 })
    expect(entryKindOptions(advance, true)).toEqual(["advance"])
  })

  it("修改時收支只能互換，轉帳不能切換類型", () => {
    expect(entryKindOptions(entry({ kind: "income" }), true)).toEqual(["expense", "income"])
    const transfer = entry({ kind: "transfer_in", category: null, counterpart_wallet: SAVINGS })
    expect(entryKindOptions(transfer, true)).toEqual(["transfer_in"])
  })
})

describe("entryActions (轉帳)", () => {
  const viewer = { userId: "bob", canManage: false }

  it("轉帳可以修改刪除", () => {
    const transfer = entry({ kind: "transfer_out", category: null, counterpart_wallet: SAVINGS })
    expect(entryActions(transfer, viewer)).toEqual({ edit: true, delete: true })
  })

  it("對方錢包已刪除的轉帳只能刪除", () => {
    const orphan = entry({ kind: "transfer_out", category: null, counterpart_wallet: null })
    expect(entryActions(orphan, viewer)).toEqual({ edit: false, delete: true })
  })
})

describe("entryCategoryOptions (轉帳)", () => {
  it("轉帳沒有分類可選", () => {
    const categories = [{ id: "food", name: "餐飲", type: "expense" as const }]
    expect(entryCategoryOptions(categories, "transfer_out", null)).toEqual([])
  })
})

describe("entryCategoryOptions (代墊)", () => {
  it("代墊沒有分類可選", () => {
    const categories = [{ id: "food", name: "餐飲", type: "expense" as const }]
    expect(entryCategoryOptions(categories, "advance", null)).toEqual([])
  })
})

describe("canRepay", () => {
  const advance = entry({ kind: "advance", category: null, advance_target_name: "小明" })

  it("還有未還金額的代墊才能還款", () => {
    expect(canRepay({ ...advance, outstanding: 300 })).toBe(true)
    expect(canRepay({ ...advance, outstanding: 0 })).toBe(false)
  })

  it("代墊以外的帳不能還款", () => {
    expect(canRepay(entry({}))).toBe(false)
    expect(canRepay(entry({ kind: "repayment", category: null, advance_id: "e-0" }))).toBe(false)
  })
})

describe("owingTargets", () => {
  it("未還清單只列未還大於 0 的人", () => {
    const targets = [
      { name: "小明", outstanding: 0 },
      { name: "小華", outstanding: 1200 },
    ]
    expect(owingTargets(targets)).toEqual([{ name: "小華", outstanding: 1200 }])
  })
})

describe("changedFields (代墊)", () => {
  it("快照裡的對象也比對", () => {
    const before: EntrySnapshot = {
      kind: "advance", amount: 500, category_name: null, advance_target_name: "小明",
      entry_date: "2026-10-18", note: "",
    }
    const log: EntryLogInfo = {
      id: "l-1", entry_id: "e-1", action: "update", actor: { user_id: "bob", nickname: "Bob" },
      as_super_admin: false, before, after: { ...before, advance_target_name: "小華" },
      created_at: "2026-10-18T00:00:00Z",
    }
    expect(changedFields(log)).toEqual(["advance_target_name"])
  })
})

// ── 旅遊錢包 ────────────────────────────────────────────────────────────────

const CAROL: MemberInfo = { user_id: "carol", nickname: "Carol", role: "member" }
/** 加入順序: Alice、Bob、Carol。 */
const TRIP_MEMBERS = [ALICE, BOB, CAROL]
const JOIN_ORDER = TRIP_MEMBERS.map((member) => member.user_id)

function expense(overrides: Partial<ExpenseInfo>): ExpenseInfo {
  return {
    id: "x-1", amount: 100, payer: { user_id: "alice", nickname: "Alice" }, split_mode: "custom",
    shares: [
      { user_id: "alice", nickname: "Alice", amount: 40 },
      { user_id: "carol", nickname: "Carol", amount: 60 },
    ],
    entry_date: "2026-11-02", note: "", created_by: { user_id: "bob", nickname: "Bob" },
    created_at: "2026-11-02T00:00:00Z", ...overrides,
  }
}

describe("splitEqually", () => {
  it("零頭先給付款人，其餘照加入順序，結果依加入順序排列", () => {
    expect(splitEqually(101, "bob", ["carol", "bob", "alice"], JOIN_ORDER)).toEqual([
      { user_id: "alice", amount: 34 },
      { user_id: "bob", amount: 34 },
      { user_id: "carol", amount: 33 },
    ])
  })

  it("付款人不在分攤對象裡時全部照加入順序", () => {
    expect(splitEqually(101, "alice", ["carol", "bob"], JOIN_ORDER)).toEqual([
      { user_id: "bob", amount: 51 },
      { user_id: "carol", amount: 50 },
    ])
  })

  it("金額少於人數時後面的人分到 0", () => {
    expect(splitEqually(1, "carol", JOIN_ORDER, JOIN_ORDER).map((share) => share.amount))
      .toEqual([0, 0, 1])
  })

  it("沒有分攤對象時是空的", () => {
    expect(splitEqually(100, "alice", [], JOIN_ORDER)).toEqual([])
  })
})

describe("expenseActions", () => {
  it("自己記的帳可以改刪", () => {
    expect(expenseActions(expense({}), { userId: "bob", canManage: false }))
      .toEqual({ edit: true, delete: true })
  })

  it("成員不能改刪別人記的帳，管理者可以", () => {
    expect(expenseActions(expense({}), { userId: "carol", canManage: false }))
      .toEqual({ edit: false, delete: false })
    expect(expenseActions(expense({}), { userId: "alice", canManage: true }))
      .toEqual({ edit: true, delete: true })
  })
})

describe("initialExpenseValues", () => {
  it("記一筆時付款人是自己、均分給所有成員", () => {
    const values = initialExpenseValues(null, TRIP_MEMBERS, "bob", "2026-11-02")
    expect(values).toMatchObject({
      amount: "", payer_id: "bob", split_mode: "equal", participant_ids: JOIN_ORDER,
      entry_date: "2026-11-02", note: "",
    })
    expect(values.shares).toHaveLength(0)
  })

  it("自己不是成員（超級管理者）時付款人留空", () => {
    expect(initialExpenseValues(null, TRIP_MEMBERS, "super", "2026-11-02").payer_id).toBe("")
  })

  it("修改指定金額的帳時帶入每一列", () => {
    const values = initialExpenseValues(expense({ note: "早餐" }), TRIP_MEMBERS, "bob", "2026-11-09")
    expect(values).toMatchObject({
      amount: "100", payer_id: "alice", split_mode: "custom", entry_date: "2026-11-02", note: "早餐",
    })
    expect(values.shares.map(({ user_id, amount }) => [user_id, amount])).toEqual([
      ["alice", "40"], ["carol", "60"],
    ])
  })

  it("修改均分的帳時勾選原本的分攤對象", () => {
    const equal = expense({
      split_mode: "equal",
      shares: [
        { user_id: "bob", nickname: "Bob", amount: 50 },
        { user_id: "carol", nickname: "Carol", amount: 50 },
      ],
    })
    expect(initialExpenseValues(equal, TRIP_MEMBERS, "bob", "2026-11-09").participant_ids)
      .toEqual(["bob", "carol"])
  })
})

describe("shareUserOptions", () => {
  const rows = [
    { key: "1", user_id: "alice", amount: "40" },
    { key: "2", user_id: "", amount: "" },
  ]

  it("每一列能選的人不含其他列已經選的", () => {
    expect(shareUserOptions(TRIP_MEMBERS, rows, "2").map((member) => member.user_id))
      .toEqual(["bob", "carol"])
  })

  it("自己這一列已經選的人留著", () => {
    expect(shareUserOptions(TRIP_MEMBERS, rows, "1").map((member) => member.user_id))
      .toEqual(["alice", "bob", "carol"])
  })
})

describe("expenseChangedFields", () => {
  const before: ExpenseSnapshot = {
    amount: 100, payer_name: "Alice", split_mode: "equal",
    shares: [{ name: "Alice", amount: 50 }, { name: "Bob", amount: 50 }],
    entry_date: "2026-11-02", note: "",
  }
  function log(after: ExpenseSnapshot): ExpenseLogInfo {
    return {
      id: "l-1", entry_id: "x-1", action: "update", actor: { user_id: "bob", nickname: "Bob" },
      as_super_admin: false, before, after, created_at: "2026-11-02T00:00:00Z",
    }
  }

  it("列出改了的欄位，依畫面上的順序", () => {
    const after = { ...before, payer_name: "Bob", note: "晚餐" }
    expect(expenseChangedFields(log(after))).toEqual(["payer_name", "note"])
  })

  it("分攤的金額或人換了也算改了分攤", () => {
    const after = { ...before, shares: [{ name: "Alice", amount: 60 }, { name: "Bob", amount: 40 }] }
    expect(expenseChangedFields(log(after))).toEqual(["shares"])
  })

  it("新增沒有改前改後", () => {
    expect(expenseChangedFields({ ...log(before), action: "create", before: null })).toEqual([])
  })
})
