import { describe, expect, it } from "vitest"
import {
  groupMenuItems, groupWallets, landingPath, moveTargets, navGroups, navSections, travelWallets,
  walletSettingsSections,
} from "@/modules/wallets/groups"
import type { WalletGroupInfo, WalletInfo } from "@/modules/wallets/types"

function wallet(overrides: Partial<WalletInfo>): WalletInfo {
  return {
    id: "w-1", kind: "general", name: "家用", status: "active", balance: 0, destination: null,
    start_date: null, end_date: null, created_at: "2026-10-17T00:00:00Z",
    my_role: "member", can_manage: false, is_favorite: false, group_id: "g-default", is_hidden: false,
    ...overrides,
  }
}

function trip(overrides: Partial<WalletInfo>): WalletInfo {
  return wallet({ id: "trip", kind: "travel", name: "東京", balance: null, group_id: null, ...overrides })
}

function group(overrides: Partial<WalletGroupInfo>): WalletGroupInfo {
  return {
    id: "g-default", name: null, is_default: true,
    wallet_count: 0, visible_count: 0, total_balance: 0, ...overrides,
  }
}

const GENERAL_DEFAULT = group({})
const YEN = group({ id: "g-yen", name: "日圓", is_default: false })

describe("walletSettingsSections", () => {
  it("一般群組照後端給的順序，各自列出自己的錢包；旅遊錢包另外列成一串", () => {
    const home = wallet({ id: "home" })
    const tokyo = wallet({ id: "tokyo", group_id: "g-yen" })
    const osaka = trip({ id: "osaka" })

    const sections = walletSettingsSections([YEN, GENERAL_DEFAULT], [home, osaka, tokyo])

    expect(sections.general.map((s) => [s.group.id, s.wallets.map((w) => w.id)])).toEqual([
      ["g-yen", ["tokyo"]],
      ["g-default", ["home"]],
    ])
    expect(sections.travel.map((w) => w.id)).toEqual(["osaka"])
  })

  it("不顯示與已結帳的錢包也列出來，維持列表的順序", () => {
    const hidden = wallet({ id: "hidden", is_hidden: true })
    const shown = wallet({ id: "shown" })
    const settled = trip({ id: "settled", status: "settled" })
    const hiddenTrip = trip({ id: "hidden-trip", is_hidden: true })

    const sections = walletSettingsSections([GENERAL_DEFAULT], [hidden, shown, hiddenTrip, settled])

    expect(sections.general[0].wallets.map((w) => w.id)).toEqual(["hidden", "shown"])
    expect(sections.travel.map((w) => w.id)).toEqual(["hidden-trip", "settled"])
  })

  it("沒有錢包的群組照樣列出", () => {
    const sections = walletSettingsSections([YEN, GENERAL_DEFAULT], [])

    expect(sections.general.map((s) => s.wallets.length)).toEqual([0, 0])
    expect(sections.travel).toEqual([])
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

  it("只有一個群組時，預設群組沒有任何操作", () => {
    expect(groupMenuItems(GENERAL_DEFAULT, 0, 1)).toEqual([])
  })
})

describe("moveTargets", () => {
  it("只列不是目前所在的群組", () => {
    const targets = moveTargets([YEN, GENERAL_DEFAULT], wallet({ group_id: "g-yen" }))

    expect(targets.map((g) => g.id)).toEqual(["g-default"])
  })

  it("旅遊錢包沒有群組可以移", () => {
    expect(moveTargets([YEN, GENERAL_DEFAULT], trip({}))).toEqual([])
  })
})

const EMPTY_DEFAULT = group({ visible_count: 0 })
const FILLED_DEFAULT = group({ visible_count: 2 })
const FILLED_YEN = group({ id: "g-yen", name: "日圓", is_default: false, visible_count: 1 })

describe("navGroups", () => {
  it("只列出有顯示中錢包的群組，自訂與預設都一樣，保留順序", () => {
    expect(navGroups([YEN, EMPTY_DEFAULT])).toEqual([])
    expect(navGroups([FILLED_DEFAULT, YEN]).map((g) => g.id)).toEqual(["g-default"])
    expect(navGroups([FILLED_YEN, FILLED_DEFAULT]).map((g) => g.id)).toEqual(["g-yen", "g-default"])
  })
})

describe("navSections", () => {
  it("一般錢包一段列出有錢包的群組，旅遊錢包一段只有一項", () => {
    const sections = navSections([FILLED_YEN, FILLED_DEFAULT], [trip({})])

    expect(sections).toEqual([
      { kind: "general", groups: [FILLED_YEN, FILLED_DEFAULT] },
      { kind: "travel" },
    ])
  })

  it("旅遊錢包都不顯示時，不列旅遊那段", () => {
    const sections = navSections([FILLED_DEFAULT], [trip({ is_hidden: true })])

    expect(sections.map((s) => s.kind)).toEqual(["general"])
  })

  it("一般群組都沒有顯示中的錢包時，不列一般那段", () => {
    const sections = navSections([YEN, EMPTY_DEFAULT], [trip({ status: "settled" })])

    expect(sections.map((s) => s.kind)).toEqual(["travel"])
  })

  it("一個錢包都沒有時 (例如剛註冊)，一段都不列", () => {
    expect(navSections([EMPTY_DEFAULT], [])).toEqual([])
  })
})

describe("landingPath", () => {
  it("先進第一個有顯示中錢包的一般群組，照自己排的順序", () => {
    expect(landingPath([YEN, FILLED_DEFAULT, FILLED_YEN], [trip({})])).toBe("/wallets/groups/g-default")
  })

  it("一般群組都沒有顯示中的錢包時，有顯示中的旅遊錢包就進旅遊錢包頁", () => {
    expect(landingPath([YEN, EMPTY_DEFAULT], [trip({})])).toBe("/wallets/travel")
  })

  it("兩種都沒有時進未分組", () => {
    expect(landingPath([YEN, EMPTY_DEFAULT], [trip({ is_hidden: true })]))
      .toBe("/wallets/groups/g-default")
  })
})

describe("groupWallets", () => {
  it("群組頁只列這個群組裡顯示中的錢包，維持列表的順序", () => {
    const list = [
      wallet({ id: "a" }), wallet({ id: "hidden", is_hidden: true }),
      wallet({ id: "other", group_id: "g-yen" }), wallet({ id: "b" }),
    ]

    expect(groupWallets(list, "g-default").map((w) => w.id)).toEqual(["a", "b"])
  })
})

describe("travelWallets", () => {
  it("旅遊錢包頁只列顯示中的旅遊錢包，維持列表的順序", () => {
    const list = [
      trip({ id: "active" }), wallet({ id: "home" }), trip({ id: "hidden", is_hidden: true }),
      trip({ id: "settling", status: "settling" }), trip({ id: "settled", status: "settled" }),
    ]

    expect(travelWallets(list).map((w) => w.id)).toEqual(["active", "settling", "settled"])
  })
})
