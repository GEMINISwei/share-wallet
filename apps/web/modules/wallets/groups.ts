import { walletGroupPath, walletsListPath } from "./paths"
import type { WalletGroupInfo, WalletInfo } from "./types"

// 錢包列表與錢包設定頁的分支。規則在後端 (`modules/wallets/groups.py`), 這裡只決定畫面上列什麼、
// 給哪些操作; 見 docs/features/wallets.md〈錢包群組〉。只有一般錢包分群組, 旅遊錢包只有顯示。

export type GroupSection = { group: WalletGroupInfo; wallets: WalletInfo[] }

/**
 * 錢包設定頁: 一般群組 (後端已依自己排的順序) 與放在裡面的錢包, 旅遊錢包另外列成一串。
 * 不顯示與已結帳的也列出: 這裡是唯一能把它們改回來或移走的地方。錢包順序沿用列表。
 */
export function walletSettingsSections(
  groups: readonly WalletGroupInfo[],
  wallets: readonly WalletInfo[],
): { general: GroupSection[]; travel: WalletInfo[] } {
  return {
    general: groups.map((group) => ({
      group, wallets: wallets.filter((wallet) => wallet.group_id === group.id),
    })),
    travel: wallets.filter((wallet) => wallet.kind === "travel"),
  }
}

export type GroupMenuItem = "moveUp" | "moveDown" | "rename" | "delete"

/** 群組的操作。預設群組不能改名、刪除; 已經在最前或最後的不給往那邊移。 */
export function groupMenuItems(
  group: WalletGroupInfo, index: number, count: number,
): GroupMenuItem[] {
  const items: (GroupMenuItem | false)[] = [
    index > 0 && "moveUp",
    index < count - 1 && "moveDown",
    !group.is_default && "rename",
    !group.is_default && "delete",
  ]
  return items.filter((item): item is GroupMenuItem => item !== false)
}

/** 錢包可以移去的群組: 不是它現在所在的那個。旅遊錢包不分群組 (後端也擋)。 */
export function moveTargets(groups: readonly WalletGroupInfo[], wallet: WalletInfo) {
  if (wallet.kind === "travel") return []
  return groups.filter((group) => group.id !== wallet.group_id)
}

/**
 * 導覽裡能選的群組 (見 docs/features/wallets.md〈錢包列表〉): 只列裡面有顯示中錢包的,
 * 自訂與預設都一樣 —— 空的群組列出來只會讓人點進一頁空白。
 */
export function navGroups(groups: readonly WalletGroupInfo[]) {
  return groups.filter((group) => group.visible_count > 0)
}

/** 旅遊錢包頁列出的錢包: 顯示中的旅遊錢包, 順序沿用列表 (依狀態, 同狀態裡最愛在前)。 */
export function travelWallets(wallets: readonly WalletInfo[]) {
  return wallets.filter((wallet) => wallet.kind === "travel" && !wallet.is_hidden)
}

export type NavSection = { kind: "general"; groups: WalletGroupInfo[] } | { kind: "travel" }

/**
 * 導覽的「錢包」展開後的段落: 一般錢包一段列出能選的群組, 旅遊錢包只有一項 (旅遊錢包頁)。
 * 沒有東西可以選的那段不列; 建立錢包時可以選類型, 不必靠空的頁面進去建立。
 */
export function navSections(
  groups: readonly WalletGroupInfo[], wallets: readonly WalletInfo[],
): NavSection[] {
  const general = navGroups(groups)
  const sections: NavSection[] = []
  if (general.length > 0) sections.push({ kind: "general", groups: general })
  if (travelWallets(wallets).length > 0) sections.push({ kind: "travel" })
  return sections
}

/**
 * 登入後與打開 `/wallets` 時進到的頁面: 第一個有顯示中錢包的一般群組, 沒有就換旅遊錢包頁,
 * 都沒有就是未分組。
 */
export function landingPath(groups: readonly WalletGroupInfo[], wallets: readonly WalletInfo[]) {
  const filled = navGroups(groups)[0]
  if (filled) return walletGroupPath(filled.id)
  if (travelWallets(wallets).length > 0) return walletsListPath("user", "travel")
  return walletGroupPath(groups.find((group) => group.is_default)?.id ?? "")
}

/** 群組頁列出的錢包: 這個群組裡顯示中的, 順序沿用列表 (依狀態, 同狀態裡最愛在前)。 */
export function groupWallets(wallets: readonly WalletInfo[], groupId: string) {
  return wallets.filter((wallet) => wallet.group_id === groupId && !wallet.is_hidden)
}
