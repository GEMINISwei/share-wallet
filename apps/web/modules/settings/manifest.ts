import type { ModuleManifest, ProtectedRoute } from "@/shared/module"

export const USER_SETTINGS_PATH = "/settings/user"
export const SYSTEM_SETTINGS_PATH = "/settings/system"

// 用戶設定是自己帳號的資料, 系統設定是這台裝置怎麼顯示與系統資訊; 入口都在「更多」面板。
const USER_SETTINGS_ROUTE = {
  path: USER_SETTINGS_PATH, label: { zh: "用戶設定", en: "User settings" }, group: "user", requires: [], navIcon: "settings", showInNav: false,
} as const satisfies ProtectedRoute

const SYSTEM_SETTINGS_ROUTE = {
  path: SYSTEM_SETTINGS_PATH, label: { zh: "系統設定", en: "System settings" }, group: "user", requires: [], navIcon: "settings", showInNav: false,
} as const satisfies ProtectedRoute

export const SETTINGS_MODULE = {
  name: "settings",
  protectedRoutes: [USER_SETTINGS_ROUTE, SYSTEM_SETTINGS_ROUTE],
} as const satisfies ModuleManifest
