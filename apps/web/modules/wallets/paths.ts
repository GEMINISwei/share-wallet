import { ADMIN_WALLETS_PATH, WALLETS_PATH } from "./manifest"
import type { WalletInfo, WalletKind } from "./types"

/**
 * 錢包頁出現在兩區: 使用者區 (自己加入的錢包) 與後台 (所有錢包)。兩區的頁面相同,
 * 只差在網址前綴與外殼, 所以畫面收 `area` 而不是各寫一份。
 */
export type WalletArea = "user" | "admin"

function listRoot(area: WalletArea) {
  return area === "admin" ? ADMIN_WALLETS_PATH : WALLETS_PATH
}

/**
 * 使用者區的 `/wallets` 會轉到第一個群組 (見 groups.ts 的 `landingGroupId`), 帶上 `kind`
 * 時只看那種類型; 一般是預設所以不帶參數。後台的列表沒有群組 (類型是篩選條件), 一律不帶。
 */
export function walletsListPath(area: WalletArea = "user", kind?: WalletKind) {
  const root = listRoot(area)
  return area === "user" && kind === "travel" ? `${root}?kind=travel` : root
}

export function walletGroupPath(groupId: string) {
  return `${WALLETS_PATH}/groups/${groupId}`
}

/** 錢包頁的返回: 回到這個錢包所在的群組。沒加入 (超級管理者) 時沒有群組, 回到同類型的第一個群組。 */
export function walletBackPath(wallet: Pick<WalletInfo, "kind" | "group_id">, area: WalletArea) {
  if (area === "user" && wallet.group_id) return walletGroupPath(wallet.group_id)
  return walletsListPath(area, wallet.kind)
}

export function walletPath(id: string, area: WalletArea = "user") {
  return `${listRoot(area)}/${id}`
}

export function walletSettingsPath(id: string, area: WalletArea = "user") {
  return `${walletPath(id, area)}/settings`
}

export function walletMembersPath(id: string, area: WalletArea = "user") {
  return `${walletPath(id, area)}/members`
}

export function walletCategoriesPath(id: string, area: WalletArea = "user") {
  return `${walletPath(id, area)}/categories`
}

export function walletHistoryPath(id: string, area: WalletArea = "user") {
  return `${walletPath(id, area)}/history`
}

/** 打開錢包頁時直接開「記一筆」: 底部導覽的「＋」在錢包頁以外選好錢包後走這裡。 */
export function addEntryPath(id: string) {
  return `${walletPath(id)}?add=1`
}

export function wantsAddEntry(param: string | null | undefined) {
  return param === "1"
}
