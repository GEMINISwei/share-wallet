import type { ModuleManifest, ProtectedRoute } from "@/shared/module"

export const WALLETS_PATH = "/wallets"
/** 自己的錢包群組與每個錢包的顯示; 在 `/wallets` 底下, 由同一個前綴保護。 */
export const WALLET_SETTINGS_PATH = `${WALLETS_PATH}/settings`
/** 管理區是真正的路徑段, 後台的錢包頁都在這底下。 */
export const ADMIN_WALLETS_PATH = "/admin/wallets"

// 不要求任何權限: 錢包功能不設全站權限, 錢包裡能做什麼由成員角色決定 (後端判斷)。
// 錢包頁、設定、成員、分類都在這個路徑底下, 由前綴一起受保護。
// 不放進一般的導覽: 使用者區的「錢包」點了要展開群組, 由外殼放 `WalletNavItem`。
const WALLETS_ROUTE = {
  path: WALLETS_PATH, label: { zh: "錢包", en: "Wallets" }, group: "user", requires: [], navIcon: "wallets", showInNav: false,
} as const satisfies ProtectedRoute

// 後台列出所有錢包, 只給超級管理者 (見 docs/features/members.md〈不設全站權限〉)。
const ADMIN_WALLETS_ROUTE = {
  path: ADMIN_WALLETS_PATH, label: { zh: "錢包", en: "Wallets" }, group: "admin", requires: ["*"], navIcon: "wallets", showInNav: true,
} as const satisfies ProtectedRoute

export const WALLETS_MODULE = {
  name: "wallets",
  protectedRoutes: [WALLETS_ROUTE, ADMIN_WALLETS_ROUTE],
} as const satisfies ModuleManifest
