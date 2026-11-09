import { expect } from "@playwright/test"
import { SIGNED_OUT, login, test } from "../support"

// 預設載入超管的登入狀態 (playwright.config.ts)。
test("後台的使用者與角色列表不顯示副標題，側欄不顯示區塊標題", async ({ page }) => {
  await page.goto("/admin/users")
  await expect(page.getByRole("heading", { name: "使用者", exact: true })).toBeVisible()
  await expect(page.getByText("查看與維護系統使用者")).toHaveCount(0)
  await expect(page.getByText("管理功能", { exact: true })).toHaveCount(0)

  await page.goto("/admin/roles")
  await expect(page.getByRole("heading", { name: "角色", exact: true })).toBeVisible()
  await expect(page.getByText("建立與維護角色權限")).toHaveCount(0)
})

test.describe("一般帳號", () => {
  test.use({ storageState: SIGNED_OUT })

  test("側欄不顯示「導覽」區塊標題", async ({ page, member }) => {
    await login(page, member)

    // 新帳號沒有錢包, 側欄沒有連結可等, 改等一定會出現的帳號選單。
    await expect(page.getByRole("button", { name: "帳號選單" })).toBeVisible()
    await expect(page.getByRole("navigation", { name: "主要導覽" }).getByText("導覽", { exact: true })).toHaveCount(0)
  })
})
