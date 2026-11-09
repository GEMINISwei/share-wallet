import { expect } from "@playwright/test"
import { SIGNED_OUT, login, test } from "../support"

// 一般帳號自己的設定, 從未登入開始, 不載入預設的超管登入狀態。
test.use({ storageState: SIGNED_OUT })

test("從帳號選單進入用戶設定與系統設定，各自只放自己的區塊", async ({ page, member }) => {
  await login(page, member)

  await page.getByRole("button", { name: "帳號選單" }).click()
  await page.getByRole("menuitem", { name: "用戶設定" }).click()
  await expect(page).toHaveURL("/settings/user")
  await expect(page.getByText("個人資料")).toBeVisible()
  await expect(page.getByLabel("目前密碼")).toBeVisible()
  await expect(page.getByText("顯示語言")).toBeHidden()

  await page.getByRole("button", { name: "帳號選單" }).click()
  await page.getByRole("menuitem", { name: "系統設定" }).click()
  await expect(page).toHaveURL("/settings/system")
  await expect(page.getByText("顯示語言")).toBeVisible()
  await expect(page.getByText("系統版本")).toBeVisible()
  await expect(page.getByLabel("目前密碼")).toBeHidden()
})

test("系統設定只列顯示語言與系統版本，不顯示區塊標題與語言說明", async ({ page, member }) => {
  await login(page, member)
  await page.goto("/settings/system")

  await expect(page.getByText("顯示語言")).toBeVisible()
  await expect(page.getByText("系統版本")).toBeVisible()
  await expect(page.getByText("語言", { exact: true })).toHaveCount(0)
  await expect(page.getByText("關於", { exact: true })).toHaveCount(0)
  await expect(page.getByText("同時決定伺服器回傳的訊息語言")).toHaveCount(0)
})
