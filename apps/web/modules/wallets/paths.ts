import { ADMIN_WALLETS_PATH, WALLETS_PATH } from "./manifest"

/**
 * 錢包頁出現在兩區: 使用者區 (自己加入的錢包) 與後台 (所有錢包)。兩區的頁面相同,
 * 只差在網址前綴與外殼, 所以畫面收 `area` 而不是各寫一份。
 */
export type WalletArea = "user" | "admin"

export function walletsListPath(area: WalletArea = "user") {
  return area === "admin" ? ADMIN_WALLETS_PATH : WALLETS_PATH
}

export function walletPath(id: string, area: WalletArea = "user") {
  return `${walletsListPath(area)}/${id}`
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
