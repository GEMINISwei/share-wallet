import { expect, test } from "@playwright/test"
import { WALLET_HOME, admin, login, logout, member } from "./support"

// 後面的測試用第一個測試建立的一般帳號; 前一個失敗時其餘的跳過, 不要接著報一串無關的錯。
test.describe.configure({ mode: "serial" })

test("超級管理者新增使用者後，列表看得到該使用者", async ({ page }) => {
  await login(page, admin)
  await page.goto("/admin/users")

  await page.getByRole("button", { name: "新增使用者" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("暱稱").fill(member.nickname)
  await dialog.getByLabel("帳號").fill(member.username)
  await dialog.getByLabel("密碼").fill(member.password)
  await dialog.getByRole("button", { name: "建立", exact: true }).click()

  await expect(dialog).toBeHidden()
  // 列表在桌面寬度下沒有帳號欄, 以暱稱辨認。
  await expect(page.getByRole("cell", { name: member.nickname, exact: true })).toBeVisible()
})

test("一般帳號進入管理區會被導回錢包列表", async ({ page }) => {
  await login(page, member)

  await page.goto("/admin/users")

  await expect(page).toHaveURL(WALLET_HOME)
})

test("從帳號選單進入用戶設定與系統設定，各自只放自己的區塊", async ({ page }) => {
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

test("登出後其他已登入的裝置也會被登出", async ({ browser }) => {
  // 兩個 context 不共用 cookie, 等於兩台裝置。
  const deviceA = await browser.newContext()
  const deviceB = await browser.newContext()
  const pageA = await deviceA.newPage()
  const pageB = await deviceB.newPage()
  await login(pageA, member)
  await login(pageB, member)

  await logout(pageA)

  // B 的 cookie 還在, 擋下它的是後端的 auth_version 比對。
  await pageB.goto("/settings")
  await expect(pageB).toHaveURL(/\/login/)

  await deviceA.close()
  await deviceB.close()
})
