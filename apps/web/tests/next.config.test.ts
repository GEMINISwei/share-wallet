/**
 * 請求 body 的上限固定在程式裡, 不開放設定。
 *
 * Next 把 `bodySizeLimit` 序列化進 build 產物, 執行期改不了; 開放設定就得在 build 與執行期
 * 各留一份再比對。上限只是防護用的天花板, 各功能自己的上限寫在功能裡
 * (見 docs/extending/uploads.md), 所以這個值不需要依部署調整。
 *
 * nginx 與 Next 的格式不同 (`16m`／`16mb`), 共用不了一個變數, 靠這支測試對齊。nginx 比 Next
 * 小時, 介於兩者之間的請求會在 nginx 拿到沒有訊息的 413, 永遠到不了應用層。
 */

import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { WALLETS_PATH } from "@/modules/wallets/public.server"

const NGINX_DIR = path.resolve(import.meta.dirname, "../../../infra/nginx")
const UNITS: Record<string, number> = { k: 1024, m: 1024 ** 2, g: 1024 ** 3 }

function toBytes(size: string): number {
  const match = /^(\d+)([kmg])b?$/i.exec(size.trim())
  if (!match) throw new Error(`無法解析容量: ${size}`)
  return Number(match[1]) * UNITS[match[2].toLowerCase()]
}

async function loadBodySizeLimit(): Promise<string | number | undefined> {
  vi.resetModules()
  const { default: config } = await import("../next.config")
  return config.experimental?.serverActions?.bodySizeLimit
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("Server Action 的 body 上限", () => {
  it("固定為 16mb", async () => {
    expect(await loadBodySizeLimit()).toBe("16mb")
  })

  it("不受環境變數影響", async () => {
    vi.stubEnv("UPLOAD_SIZE_LIMIT", "1mb")

    expect(await loadBodySizeLimit()).toBe("16mb")
  })
})

describe("nginx 的 client_max_body_size", () => {
  const templates = readdirSync(NGINX_DIR).filter((name) => name.endsWith(".template"))

  it("找得到模板", () => {
    // 路徑算錯時「沒有模板」與「全部一致」看起來一樣。
    expect(templates.length).toBeGreaterThan(0)
  })

  it.each(templates)("%s 與 Server Action 的上限相同", async (name) => {
    const source = readFileSync(path.join(NGINX_DIR, name), "utf-8")
    const sizes = [...source.matchAll(/^\s*client_max_body_size\s+(\S+);/gm)].map((match) => match[1])

    expect(sizes).toHaveLength(1)
    expect(toBytes(sizes[0])).toBe(toBytes(String(await loadBodySizeLimit())))
  })
})

describe("開發時允許的來源", () => {
  // `make start lan` 讓手機從區網連進來; Next dev 預設擋掉非 localhost 來源的 HMR 與 /_next,
  // 頁面只剩伺服器渲染的 HTML, 不會 hydrate。只在 port 有對區網開放時才連得到, 所以一律允許。
  async function loadAllowedDevOrigins(): Promise<string[]> {
    vi.resetModules()
    const { default: config } = await import("../next.config")
    return config.allowedDevOrigins ?? []
  }

  it.each(["192.168.*.*", "10.*.*.*", "172.16.*.*", "172.31.*.*", "*.local"])("允許 %s", async (pattern) => {
    expect(await loadAllowedDevOrigins()).toContain(pattern)
  })

  it("不允許私有網段以外的 172.*", async () => {
    // 172.16.0.0/12 只到 172.31, 172.32 以後是公開位址。
    const origins = await loadAllowedDevOrigins()

    expect(origins).not.toContain("172.*.*.*")
    expect(origins).not.toContain("172.32.*.*")
  })
})

describe("首頁導向", () => {
  // 寫在 page.tsx 的 redirect() 會先進 React 渲染再丟出 NEXT_REDIRECT; Next 16 開發版記錄這次
  // 「出錯」時帶了負的時間戳給 performance.measure, Safari 會跳出 TypeError (vercel/next.js#86060)。
  // config 的導向在渲染之前就完成, 不經過 React。
  it("暫時導向錢包列表", async () => {
    vi.resetModules()
    const { default: config } = await import("../next.config")
    const redirects = (await config.redirects?.()) ?? []

    // permanent 會讓瀏覽器快取 308, 之後首頁改導別處時, 來過的人仍被舊的導向帶走。
    expect(redirects).toContainEqual({ source: "/", destination: WALLETS_PATH, permanent: false })
  })

  it("舊的設定頁暫時導向用戶設定", async () => {
    // 設定頁拆成用戶設定與系統設定之前, 加到主畫面的 PWA 與書籤存的是 /settings。
    vi.resetModules()
    const { default: config } = await import("../next.config")
    const redirects = (await config.redirects?.()) ?? []

    expect(redirects).toContainEqual({ source: "/settings", destination: "/settings/user", permanent: false })
  })
})
