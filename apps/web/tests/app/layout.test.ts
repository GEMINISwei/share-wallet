/**
 * 手機上點輸入框時, iOS Safari 會在字級小於 16px 時自動放大畫面, 使用者得自己縮回來。
 * 這個專案要模擬 App 的手感, 所以根 layout 的 viewport 鎖住縮放比例。
 */

import { describe, expect, it } from "vitest"
import { viewport } from "@/app/layout"

describe("root layout viewport", () => {
  it("鎖住縮放比例, 點輸入框不會放大畫面", () => {
    expect(viewport).toMatchObject({
      width: "device-width",
      initialScale: 1,
      maximumScale: 1,
      userScalable: false,
    })
  })
})
