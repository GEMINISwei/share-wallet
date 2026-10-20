import { ADMIN_WALLETS_PATH, WALLETS_PATH } from "./manifest"
import type { WalletKind } from "./types"

/**
 * 錢包頁出現在兩區: 使用者區 (自己加入的錢包) 與後台 (所有錢包)。兩區的頁面相同,
 * 只差在網址前綴與外殼, 所以畫面收 `area` 而不是各寫一份。
 */
export type WalletArea = "user" | "admin"

function listRoot(area: WalletArea) {
  return area === "admin" ? ADMIN_WALLETS_PATH : WALLETS_PATH
}

/**
 * 使用者區的列表依類型分頁, 帶上 `kind` 時回到那個分頁; 一般是預設分頁所以不帶參數。
 * 後台的列表沒有分頁 (類型是篩選條件), 一律不帶。
 */
export function walletsListPath(area: WalletArea = "user", kind?: WalletKind) {
  const root = listRoot(area)
  return area === "user" && kind === "travel" ? `${root}?tab=travel` : root
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
