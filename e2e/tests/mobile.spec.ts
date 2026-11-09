import { expect } from "@playwright/test"
import { test } from "./support"

// WebApp 在手機上要像原生 App: 畫面不能縮放 (理由與代價見 docs/decisions/0013-lock-mobile-zoom.md)。
// viewport 鎖住雙指縮放, `touch-action` 擋雙擊放大。
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

test("viewport 鎖住縮放，雙指不能放大畫面", async ({ page }) => {
  await page.goto("/settings/user")

  const content = await page.locator("meta[name=viewport]").getAttribute("content")
  const directives = (content ?? "").split(",").map((part) => part.trim().replace(/\s+/g, ""))

  expect(directives).toContain("maximum-scale=1")
  expect(directives).toContain("user-scalable=no")
})

test("雙擊不會放大畫面", async ({ page }) => {
  await page.goto("/settings/user")

  const touchAction = await page.evaluate(() => getComputedStyle(document.documentElement).touchAction)

  expect(touchAction).toBe("manipulation")
})
