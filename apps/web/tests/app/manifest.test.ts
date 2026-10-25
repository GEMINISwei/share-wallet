/**
 * PWA 的 `theme_color` 是 JSON, 吃不到 `var()`, 只能把底色抄一份。
 *
 * 換主題時漏改不會有任何錯誤, 只有裝了 PWA 的人在啟動畫面與狀態列看到舊的顏色。
 * 這支測試從 theme.css 與 tokens.css 算出實際生效的 `--color-bg-app`, 跟 manifest 比對。
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import manifest from "@/app/manifest"

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

function declaredValue(file: string, name: string) {
  const source = fs.readFileSync(path.join(SRC, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
  return source.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`))?.[1].trim()
}

describe("manifest", () => {
  it("theme_color 等於實際生效的 --color-bg-app", () => {
    // theme.css 在 tokens.css 之後載入, 有覆寫就是它贏。
    const effective = declaredValue("app/theme.css", "color-bg-app")
      ?? declaredValue("shared/ui/styles/tokens.css", "color-bg-app")

    expect(effective).toMatch(/^#[0-9A-Fa-f]{6}$/)
    expect(manifest().theme_color?.toUpperCase()).toBe(effective?.toUpperCase())
  })
})
