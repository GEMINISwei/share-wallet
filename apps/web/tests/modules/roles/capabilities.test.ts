import { describe, expect, it } from "vitest"
import {
  canEditRoleDetails,
  canEditRolePermissions,
  groupPermissionOptions,
} from "@/modules/roles/capabilities"
import type { PermissionOption, RoleInfo } from "@/modules/roles/types"

describe("groupPermissionOptions", () => {
  const option = (value: string, category: string) =>
    ({ value, label: value, category }) as PermissionOption

  it("依 category 分組，組與組內都保留後端的順序", () => {
    const groups = groupPermissionOptions([
      option("users:create", "使用者"),
      option("roles:read", "角色"),
      option("users:read", "使用者"),
    ])

    expect(groups.map((group) => group.category)).toEqual(["使用者", "角色"])
    expect(groups[0].options.map((item) => item.value)).toEqual(["users:create", "users:read"])
  })

  it("每一個選項都會出現在某一組裡（不會有被吃掉的權限）", () => {
    const options = [option("a:read", "A"), option("b:read", "B"), option("c:read", "C")]

    expect(groupPermissionOptions(options).flatMap((group) => group.options)).toHaveLength(3)
  })
})

const role = (code: string | null, permissions: string[] = []) =>
  ({ id: "r", name: "r", code, permissions, is_disabled: false }) as RoleInfo

describe("canEditRoleDetails", () => {
  it("一般角色可以改名稱與狀態", () => {
    expect(canEditRoleDetails(role(null))).toBe(true)
  })

  it("系統角色（超管、一般用戶）不能改名稱與狀態", () => {
    expect(canEditRoleDetails(role("super_admin", ["*"]))).toBe(false)
    expect(canEditRoleDetails(role("user"))).toBe(false)
  })
})

describe("canEditRolePermissions", () => {
  it("一般用戶這個系統角色可以改權限", () => {
    expect(canEditRolePermissions(role("user"))).toBe(true)
  })

  it("超級管理者角色不能改權限", () => {
    expect(canEditRolePermissions(role("super_admin", ["*"]))).toBe(false)
  })

  it("一般角色可以改權限", () => {
    expect(canEditRolePermissions(role(null))).toBe(true)
  })
})
