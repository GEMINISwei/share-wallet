import type { WalletGroupInfo, WalletInfo, WalletKind } from "./types"

// 錢包設定頁的分支。規則在後端 (`modules/wallets/groups.py`), 這裡只決定畫面上列什麼、
// 給哪些操作; 見 docs/features/wallets.md〈錢包群組〉。

export type GroupSection = { group: WalletGroupInfo; wallets: WalletInfo[] }

/**
 * 錢包設定頁: 每種類型的群組 (後端已依自己排的順序), 底下是放在裡面的錢包。
 * 不顯示與已結帳的也列出: 這裡是唯一能把它們改回來或移走的地方。錢包順序沿用列表。
 */
export function walletSettingsSections(
  groups: readonly WalletGroupInfo[],
  wallets: readonly WalletInfo[],
): Record<WalletKind, GroupSection[]> {
  const sectionsOf = (kind: WalletKind) => groups
    .filter((group) => group.kind === kind)
    .map((group) => ({ group, wallets: wallets.filter((wallet) => wallet.group_id === group.id) }))
  return { general: sectionsOf("general"), travel: sectionsOf("travel") }
}

export type GroupMenuItem = "moveUp" | "moveDown" | "rename" | "delete"

/** 群組的操作。預設群組不能改名、刪除; 已經在最前或最後的不給往那邊移。 */
export function groupMenuItems(
  group: WalletGroupInfo, index: number, sameKindCount: number,
): GroupMenuItem[] {
  const items: (GroupMenuItem | false)[] = [
    index > 0 && "moveUp",
    index < sameKindCount - 1 && "moveDown",
    !group.is_default && "rename",
    !group.is_default && "delete",
  ]
  return items.filter((item): item is GroupMenuItem => item !== false)
}

/** 錢包可以移去的群組: 同類型 (後端也擋), 而且不是它現在所在的那個。 */
export function moveTargets(groups: readonly WalletGroupInfo[], wallet: WalletInfo) {
  return groups.filter((group) => group.kind === wallet.kind && group.id !== wallet.group_id)
}

/**
 * 導覽裡能選的群組 (見 docs/features/wallets.md〈錢包列表〉): 自訂群組一律列出, 預設群組只有裡面有
 * 顯示中的錢包才列出 —— 「未選擇」空著時列出來只會讓人點進一頁空白。
 */
export function navGroups(groups: readonly WalletGroupInfo[], kind: WalletKind) {
  return groups.filter(
    (group) => group.kind === kind && (!group.is_default || group.visible_count > 0),
  )
}

export type NavSection = { kind: WalletKind; groups: WalletGroupInfo[] }

/**
 * 導覽的「錢包」展開後的兩段: 一般、旅遊各自能選的群組。一種都沒有時列出它的預設群組,
 * 才進得去建立那種錢包。
 */
export function navSections(groups: readonly WalletGroupInfo[]): NavSection[] {
  return (["general", "travel"] as const).map((kind) => {
    const choices = navGroups(groups, kind)
    const fallback = groups.filter((group) => group.kind === kind && group.is_default)
    return { kind, groups: choices.length > 0 ? choices : fallback }
  })
}

function defaultGroupId(groups: readonly WalletGroupInfo[], kind: WalletKind) {
  return groups.find((group) => group.kind === kind && group.is_default)?.id ?? ""
}

function firstFilled(groups: readonly WalletGroupInfo[], kind: WalletKind) {
  return groups.find((group) => group.kind === kind && group.visible_count > 0)?.id
}

/**
 * 登入後與打開 `/wallets` 時進到的群組: 第一個有顯示中錢包的一般群組, 沒有就換旅遊群組,
 * 都沒有就是一般的預設群組。指定類型時只看那種類型。
 */
export function landingGroupId(groups: readonly WalletGroupInfo[], kind?: WalletKind) {
  if (kind) return firstFilled(groups, kind) ?? defaultGroupId(groups, kind)
  return firstFilled(groups, "general") ?? firstFilled(groups, "travel")
    ?? defaultGroupId(groups, "general")
}

/** 群組頁列出的錢包: 這個群組裡顯示中的, 順序沿用列表 (最愛在前、已結帳最後)。 */
export function groupWallets(wallets: readonly WalletInfo[], groupId: string) {
  return wallets.filter((wallet) => wallet.group_id === groupId && !wallet.is_hidden)
}
