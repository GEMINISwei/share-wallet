import { hasAllPermission } from "@/shared/access/permissions"
import type { PermissionOption, RoleInfo } from "./types"

// 這個模組的畫面只有超級管理者進得來 (`admin/layout.tsx`), 所以不必再看操作者的權限。
// 兩條規則與後端 `modules/roles/service.py` 的 `update_role` 同一組。

/**
 * 能不能改名稱與狀態。系統角色 (有 `code`) 不行: 名稱由模板同步, 停用則會讓註冊或超管失效。
 */
export function canEditRoleDetails(role: RoleInfo) {
  return role.code === null
}

/** 能不能改權限。只有超級管理者角色不行 (`*` 就是它存在的意義); 一般用戶這個系統角色可以。 */
export function canEditRolePermissions(role: RoleInfo) {
  return !hasAllPermission(role.permissions)
}

export type PermissionGroup = {
  category: string
  options: PermissionOption[]
}

/**
 * 依後端給的 `category` 分組, 組與組內的順序都照後端回來的順序 (各 module 的宣告順序)。
 *
 * 標籤與分類都來自後端 (`GET /roles/permission-options`), 前端不另外維護一份 ——
 * 新增 module 時不必回頭改這裡, 後端也在啟動時就保證每個權限都有標籤。
 */
export function groupPermissionOptions(options: readonly PermissionOption[]): PermissionGroup[] {
  const groups = new Map<string, PermissionOption[]>()
  for (const option of options) {
    groups.set(option.category, [...(groups.get(option.category) ?? []), option])
  }
  return [...groups].map(([category, grouped]) => ({ category, options: grouped }))
}
