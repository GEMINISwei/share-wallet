import { HTML_LANG, type Locale } from "@/shared/i18n/locale"

/** 整數金額加上千分位。不帶幣別: 系統不設幣別 (見 docs/features.md〈金額〉)。 */
export function formatAmount(amount: number, locale: Locale) {
  return new Intl.NumberFormat(HTML_LANG[locale], { maximumFractionDigits: 0 }).format(amount)
}

/**
 * 日期 (不含時間)。`timeZone` 沒給時用執行環境的時區: 伺服器與瀏覽器的時區可能不同,
 * 所以畫面上要經過 `ui/LocalDate` 才不會在 hydration 時對不上。
 */
export function formatDate(iso: string, locale: Locale, timeZone?: string) {
  return new Intl.DateTimeFormat(HTML_LANG[locale], { dateStyle: "medium", timeZone })
    .format(new Date(iso))
}
