import type { WalletGroupInfo, WalletInfo, WalletKind } from "./types"

// 錢包設定頁的分支。規則在後端 (`modules/wallets/groups.py`), 這裡只決定畫面上列什麼、
// 給哪些操作; 見 docs/features.md〈錢包群組〉。

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
