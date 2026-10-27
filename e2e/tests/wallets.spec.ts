import { expect, test, type Page } from "@playwright/test"
import { WALLET_HOME } from "./support"

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
  await expect(page).toHaveURL(WALLET_HOME)
}

test("建立一般錢包後進入錢包頁，餘額是初始餘額", async ({ page }) => {
  await page.goto("/signup")
  await signup(page, owner)
  await expect(page).toHaveURL(WALLET_HOME)

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

test("從帳號選單進入錢包設定，新增群組、把錢包移進去並設為不顯示", async ({ page }) => {
  await loginAs(page, owner)
  await page.getByRole("button", { name: "帳號選單" }).click()
  await page.getByRole("menuitem", { name: "錢包設定" }).click()
  await expect(page).toHaveURL("/wallets/settings")

  const general = page.getByRole("region", { name: "一般群組" })
  await general.getByRole("button", { name: "新增群組" }).click()
  const createDialog = page.getByRole("dialog", { name: "新增群組" })
  await createDialog.getByRole("textbox", { name: "名稱" }).fill("日圓")
  await createDialog.getByRole("button", { name: "儲存", exact: true }).click()
  await expect(createDialog).toBeHidden()

  const yen = page.getByRole("region", { name: "日圓" })
  await expect(yen).toBeVisible()
  const unsorted = page.getByRole("region", { name: "一般錢包（未選擇）" })
  const row = unsorted.getByRole("listitem").filter({ hasText: walletName })
  await row.getByRole("button", { name: "操作選單" }).click()
  await page.getByRole("menuitem", { name: "移到其他群組" }).click()
  const moveDialog = page.getByRole("dialog", { name: "移到其他群組" })
  await moveDialog.getByRole("combobox", { name: "群組" }).selectOption({ label: "日圓" })
  await moveDialog.getByRole("button", { name: "儲存", exact: true }).click()
  await expect(moveDialog).toBeHidden()

  const moved = yen.getByRole("listitem").filter({ hasText: walletName })
  await expect(moved).toBeVisible()
  await moved.getByRole("button", { name: "操作選單" }).click()
  await page.getByRole("menuitem", { name: "設為不顯示" }).click()
  await expect(moved.getByText("不顯示", { exact: true })).toBeVisible()
})

test("群組頁只列顯示中的錢包，總額只算顯示中的錢包", async ({ page }) => {
  await loginAs(page, owner)
  // 上一個測試把錢包移進「日圓」並設為不顯示: 沒有任何顯示中的錢包, 進到一般的預設群組。
  await expect(page.getByRole("heading", { name: "一般錢包（未選擇）" })).toBeVisible()

  // 在群組頁時側欄的「錢包」預設展開; 一般錢包那段只剩「日圓」(預設群組裡沒有顯示中的錢包)。
  const sidebar = page.getByRole("navigation", { name: "主要導覽" })
  await expect(sidebar.getByRole("button", { name: "錢包", exact: true }))
    .toHaveAttribute("aria-expanded", "true")
  const generalSection = sidebar.getByRole("group", { name: "一般錢包" })
  await expect(generalSection.getByRole("link")).toHaveCount(1)
  await generalSection.getByRole("link", { name: /日圓/ }).click()
  await expect(page.getByRole("heading", { name: "日圓" })).toBeVisible()
  await expect(page.getByText(walletName)).toBeHidden()

  await page.goto("/wallets/settings")
  const row = page.getByRole("region", { name: "日圓" }).getByRole("listitem")
    .filter({ hasText: walletName })
  await row.getByRole("button", { name: "操作選單" }).click()
  await page.getByRole("menuitem", { name: "設為顯示" }).click()
  await expect(row.getByText("不顯示", { exact: true })).toBeHidden()

  await page.goto("/wallets")
  await expect(page).toHaveURL(WALLET_HOME)
  await expect(page.getByRole("heading", { name: "日圓" })).toBeVisible()
  await expect(page.getByText(walletName)).toBeVisible()
  await expect(page.getByText("9,500").first()).toBeVisible()
})
