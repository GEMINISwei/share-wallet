import { HTML_LANG, type Locale } from "@/shared/i18n/locale"

/** 整數金額加上千分位。不帶幣別: 系統不設幣別 (見 docs/features.md〈金額〉)。 */
export function formatAmount(amount: number, locale: Locale) {
  return new Intl.NumberFormat(HTML_LANG[locale], { maximumFractionDigits: 0 }).format(amount)
}
