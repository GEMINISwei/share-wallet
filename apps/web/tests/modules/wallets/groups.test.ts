import { describe, expect, it } from "vitest"
import { groupMenuItems, moveTargets, walletSettingsSections } from "@/modules/wallets/groups"
import type { WalletGroupInfo, WalletInfo } from "@/modules/wallets/types"

function wallet(overrides: Partial<WalletInfo>): WalletInfo {
  return {
    id: "w-1", kind: "general", name: "家用", status: "active", balance: 0, destination: null,
    start_date: null, end_date: null, created_at: "2026-10-17T00:00:00Z",
    my_role: "member", can_manage: false, is_favorite: false, group_id: "g-default", is_hidden: false,
    ...overrides,
  }
}

function group(overrides: Partial<WalletGroupInfo>): WalletGroupInfo {
  return {
    id: "g-default", kind: "general", name: null, is_default: true,
    wallet_count: 0, visible_count: 0, total_balance: 0, ...overrides,
  }
}

const GENERAL_DEFAULT = group({})
const YEN = group({ id: "g-yen", name: "日圓", is_default: false })
const TRAVEL_DEFAULT = group({ id: "g-travel", kind: "travel", total_balance: null })

describe("walletSettingsSections", () => {
  it("依類型分開，群組照後端給的順序，各自列出自己的錢包", () => {
    const home = wallet({ id: "home" })
    const tokyo = wallet({ id: "tokyo", group_id: "g-yen" })
    const trip = wallet({ id: "trip", kind: "travel", group_id: "g-travel" })

    const groups = [YEN, GENERAL_DEFAULT, TRAVEL_DEFAULT]
    const sections = walletSettingsSections(groups, [home, tokyo, trip])

    expect(sections.general.map((s) => [s.group.id, s.wallets.map((w) => w.id)])).toEqual([
      ["g-yen", ["tokyo"]],
      ["g-default", ["home"]],
    ])
    expect(sections.travel.map((s) => [s.group.id, s.wallets.map((w) => w.id)])).toEqual([
      ["g-travel", ["trip"]],
    ])
  })

  it("不顯示與已結帳的錢包也列出來，維持列表的順序", () => {
    const hidden = wallet({ id: "hidden", is_hidden: true })
    const settled = wallet({ id: "settled", kind: "travel", group_id: "g-travel", status: "settled" })
    const shown = wallet({ id: "shown" })

    const groups = [GENERAL_DEFAULT, TRAVEL_DEFAULT]
    const sections = walletSettingsSections(groups, [hidden, shown, settled])

    expect(sections.general[0].wallets.map((w) => w.id)).toEqual(["hidden", "shown"])
    expect(sections.travel[0].wallets.map((w) => w.id)).toEqual(["settled"])
  })

  it("沒有錢包的群組照樣列出", () => {
    const sections = walletSettingsSections([YEN, GENERAL_DEFAULT], [])

    expect(sections.general.map((s) => s.wallets.length)).toEqual([0, 0])
  })
})

describe("groupMenuItems", () => {
  it("自訂群組在中間時可以上移、下移、改名、刪除", () => {
    expect(groupMenuItems(YEN, 1, 3)).toEqual(["moveUp", "moveDown", "rename", "delete"])
  })

  it("預設群組只能移動，不能改名或刪除", () => {
    expect(groupMenuItems(GENERAL_DEFAULT, 1, 3)).toEqual(["moveUp", "moveDown"])
  })

  it("最前面不能上移、最後面不能下移", () => {
    expect(groupMenuItems(YEN, 0, 2)).toEqual(["moveDown", "rename", "delete"])
    expect(groupMenuItems(YEN, 1, 2)).toEqual(["moveUp", "rename", "delete"])
  })

  it("同類型只有一個群組時，預設群組沒有任何操作", () => {
    expect(groupMenuItems(GENERAL_DEFAULT, 0, 1)).toEqual([])
  })
})

describe("moveTargets", () => {
  it("只列同類型、而且不是目前所在的群組", () => {
    const targets = moveTargets([YEN, GENERAL_DEFAULT, TRAVEL_DEFAULT], wallet({ group_id: "g-yen" }))

    expect(targets.map((g) => g.id)).toEqual(["g-default"])
  })

  it("旅遊錢包只能移到旅遊群組", () => {
    const trip = wallet({ kind: "travel", group_id: "g-travel" })
    const otherTrip = group({ id: "g-japan", kind: "travel", name: "日本", is_default: false })

    expect(moveTargets([YEN, GENERAL_DEFAULT, TRAVEL_DEFAULT, otherTrip], trip).map((g) => g.id))
      .toEqual(["g-japan"])
  })
})
