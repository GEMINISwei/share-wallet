import { expect, test, type Page } from "@playwright/test"

// 資料庫每次都是新的, 名稱固定即可; 跟其他 spec 的帳號分開, 執行順序才互不影響。
const owner = { nickname: "E2E 錢包管理者", username: "e2e-wallet-owner", password: "e2e-wallet-owner-pw" }
const joiner = { nickname: "E2E 受邀者", username: "e2e-wallet-joiner", password: "e2e-wallet-joiner-pw" }
const walletName = "E2E 家用"

// 後面的測試接著用第一個測試建的錢包; 前一個失敗時其餘的跳過, 不要接著報一串無關的錯。
test.describe.configure({ mode: "serial" })

let walletUrl = ""

async function signup(page: Page, account: typeof owner) {
  await page.getByRole("textbox", { name: "暱稱" }).fill(account.nickname)
  await page.getByRole("textbox", { name: "帳號" }).fill(account.username)
  await page.getByLabel("密碼", { exact: true }).fill(account.password)
  await page.getByRole("button", { name: "建立帳號", exact: true }).click()
}

async function loginAs(page: Page, account: typeof owner) {
  await page.goto("/login")
  await page.getByRole("textbox", { name: "帳號" }).fill(account.username)
  await page.getByLabel("密碼", { exact: true }).fill(account.password)
  await page.getByRole("button", { name: "登入", exact: true }).click()
  await expect(page).toHaveURL("/wallets")
}

test("建立一般錢包後進入錢包頁，餘額是初始餘額", async ({ page }) => {
  await page.goto("/signup")
  await signup(page, owner)
  await expect(page).toHaveURL("/wallets")

  await page.getByRole("button", { name: "建立錢包" }).first().click()
  const dialog = page.getByRole("dialog", { name: "建立錢包" })
  await dialog.getByRole("textbox", { name: "名稱" }).fill(walletName)
  await dialog.getByRole("textbox", { name: "初始餘額" }).fill("10000")
  await dialog.getByRole("button", { name: "建立", exact: true }).click()

  await expect(page).toHaveURL(/\/wallets\/[0-9a-f-]+$/)
  walletUrl = page.url()
  await expect(page.getByRole("heading", { name: walletName })).toBeVisible()
  await expect(page.getByText("10,000").first()).toBeVisible()

  await page.goto("/wallets")
  await expect(page.getByText(walletName)).toBeVisible()
})

test("記一筆支出後餘額減少，帳目列表看得到這一筆", async ({ page }) => {
  await loginAs(page, owner)
  await page.goto(walletUrl)

  await page.getByRole("button", { name: "記一筆" }).first().click()
  const dialog = page.getByRole("dialog", { name: "記一筆" })
  await dialog.getByRole("textbox", { name: "金額" }).fill("500")
  await dialog.getByRole("radio", { name: "餐飲" }).click()
  await dialog.getByRole("textbox", { name: "備註" }).fill("午餐")
  await dialog.getByRole("button", { name: "儲存", exact: true }).click()

  await expect(dialog).toBeHidden()
  await expect(page.getByText("午餐")).toBeVisible()
  await expect(page.getByText("9,500").first()).toBeVisible()
})

test("沒有帳號的人打開邀請連結，註冊後確認加入，成為錢包成員", async ({ page, browser }) => {
  await loginAs(page, owner)
  await page.goto(`${walletUrl}/members`)
  await page.getByRole("button", { name: "邀請" }).first().click()
  const inviteDialog = page.getByRole("dialog", { name: "邀請連結" })
  await inviteDialog.getByRole("button", { name: "產生連結" }).click()
  const link = await inviteDialog.getByRole("textbox", { name: "連結" }).inputValue()
  expect(link).toMatch(/\/invite\/[^/]+$/)

  // 另一個 context 不共用 cookie, 等於另一個人的手機。
  const guest = await (await browser.newContext()).newPage()
  await guest.goto(new URL(link).pathname)
  await expect(guest).toHaveURL(/\/login\?invite=/)
  await guest.getByRole("button", { name: "還沒有帳號？註冊" }).click()
  await expect(guest).toHaveURL(/\/signup\?invite=/)
  await signup(guest, joiner)

  await expect(guest.getByRole("heading", { name: `加入「${walletName}」？` })).toBeVisible()
  await guest.getByRole("button", { name: "加入", exact: true }).click()
  await expect(guest).toHaveURL(walletUrl.replace(/^https?:\/\/[^/]+/, ""))
  await expect(guest.getByRole("heading", { name: walletName })).toBeVisible()

  await page.reload()
  await expect(page.getByText(joiner.nickname)).toBeVisible()
})
