import type { ModuleManifest, ProtectedRoute } from "@/shared/module"

export const WALLETS_PATH = "/wallets"

// 不要求任何權限: 錢包功能不設全站權限, 錢包裡能做什麼由成員角色決定 (後端判斷)。
// 錢包頁、設定、成員、分類都在這個路徑底下, 由前綴一起受保護。
const WALLETS_ROUTE = {
  path: WALLETS_PATH, label: { zh: "錢包", en: "Wallets" }, group: "user", requires: [], navIcon: "wallets", showInNav: true,
} as const satisfies ProtectedRoute

export const WALLETS_MODULE = {
  name: "wallets",
  protectedRoutes: [WALLETS_ROUTE],
} as const satisfies ModuleManifest
