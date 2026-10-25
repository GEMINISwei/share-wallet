import { expect, test, type Page } from "@playwright/test"
import { admin } from "./support"

// 資料庫每次都是新的, 名稱固定即可; 跟 users.spec.ts 的一般帳號分開, 兩支的順序才互不影響。
const newcomer = {
  nickname: "E2E 註冊帳號",
  username: "e2e-signup",
  password: "e2e-signup-password",
}

async function fillSignup(page: Page, account: typeof newcomer) {
  await page.getByRole("textbox", { name: "暱稱" }).fill(account.nickname)
  await page.getByRole("textbox", { name: "帳號" }).fill(account.username)
  await page.getByLabel("密碼", { exact: true }).fill(account.password)
  await page.getByRole("button", { name: "建立帳號", exact: true }).click()
}

test.describe.configure({ mode: "serial" })

test("從登入頁進入註冊，註冊完直接是登入狀態並進入首頁", async ({ page, context }) => {
  await page.goto("/login")
  await page.getByRole("button", { name: "還沒有帳號？註冊" }).click()
  await expect(page).toHaveURL(/\/signup/)

  await fillSignup(page, newcomer)

  await expect(page).toHaveURL("/")
  const cookies = await context.cookies()
  expect(cookies.find((cookie) => cookie.name === "access_token")?.httpOnly).toBe(true)
})

test("註冊的帳號進入管理區會被導回首頁", async ({ page }) => {
  await page.goto("/login")
  await page.getByRole("textbox", { name: "帳號" }).fill(newcomer.username)
  await page.getByLabel("密碼", { exact: true }).fill(newcomer.password)
  await page.getByRole("button", { name: "登入", exact: true }).click()
  await expect(page).toHaveURL("/")

  await page.goto("/admin/users")

  await expect(page).toHaveURL("/")
})

test("已存在的帳號不能註冊，留在註冊頁並顯示錯誤訊息", async ({ page }) => {
  await page.goto("/signup")

  await fillSignup(page, { ...newcomer, username: admin.username })

  // 文案來自後端的 LangText, 依請求的語系回傳。
  await expect(page.getByText("帳號已存在")).toBeVisible()
  await expect(page).toHaveURL(/\/signup/)
})
