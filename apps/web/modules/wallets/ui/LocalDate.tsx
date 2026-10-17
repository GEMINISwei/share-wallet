"use client"

import { useSyncExternalStore } from "react"
import { useLocale } from "@/shared/i18n/context"
import { formatDate } from "../format"

const subscribe = () => () => {}

/**
 * 以瀏覽器的時區顯示日期。伺服器 render 時不知道使用者的時區, 先用 UTC; hydration 之後
 * 換成本地時區。用 `useSyncExternalStore` 的 server snapshot 而不是直接格式化, 否則兩邊
 * 時區不同時 React 會報 hydration mismatch。
 */
export default function LocalDate({ iso }: { iso: string }) {
  const locale = useLocale()
  const text = useSyncExternalStore(
    subscribe,
    () => formatDate(iso, locale),
    () => formatDate(iso, locale, "UTC"),
  )
  return <time dateTime={iso}>{text}</time>
}
