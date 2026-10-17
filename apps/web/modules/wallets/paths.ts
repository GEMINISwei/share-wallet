import { WALLETS_PATH } from "./manifest"

export function walletPath(id: string) {
  return `${WALLETS_PATH}/${id}`
}

export function walletSettingsPath(id: string) {
  return `${walletPath(id)}/settings`
}

export function walletMembersPath(id: string) {
  return `${walletPath(id)}/members`
}

export function walletCategoriesPath(id: string) {
  return `${walletPath(id)}/categories`
}
