import "server-only"
export { WALLETS_PATH } from "./manifest"
export { default as WalletsPage, generateMetadata as generateWalletsMetadata } from "./page.server"
export { default as WalletPage, generateMetadata as generateWalletMetadata } from "./wallet-page.server"
export type { WalletPageProps } from "./wallet-page.server"
export {
  default as WalletSettingsPage, generateMetadata as generateWalletSettingsMetadata,
} from "./settings-page.server"
export {
  default as WalletMembersPage, generateMetadata as generateWalletMembersMetadata,
} from "./members-page.server"
export {
  default as WalletCategoriesPage, generateMetadata as generateWalletCategoriesMetadata,
} from "./categories-page.server"
