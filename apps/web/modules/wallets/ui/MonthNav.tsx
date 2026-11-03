"use client"

import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"
import { ICON_SIZE } from "@/shared/ui"
import { useLocale, useT } from "@/shared/i18n/context"
import { formatMonth, localMonth, shiftMonth } from "../format"
import { walletsMessages } from "../i18n"
import styles from "./wallets.module.css"

type MonthNavProps = {
  month: string
  /** 網址沒指定月份時, 伺服器用的是它自己時區的這個月。 */
  fromUrl: boolean
}

/**
 * 帳目的月份切換 (見 docs/features/general-wallet.md〈帳目列表〉)。月份放在網址上:
 * 記帳後 `router.refresh()` 留在同一個月, 重新整理、分享連結也一樣。
 */
export default function MonthNav({ month, fromUrl }: MonthNavProps) {
  const t = useT(walletsMessages)
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const href = (target: string) => `${pathname}?month=${target}`

  // 月初、月底幾個小時內伺服器與使用者的「這個月」會不同, 以使用者的為準。
  useEffect(() => {
    const current = localMonth()
    if (!fromUrl && month !== current) router.replace(`${pathname}?month=${current}`, { scroll: false })
  }, [fromUrl, month, pathname, router])

  return (
    <nav className={styles.monthNav} aria-label={t("entries")}>
      <Link href={href(shiftMonth(month, -1))} scroll={false} className={styles.monthStep} aria-label={t("prevMonth")}>
        <ChevronLeft size={ICON_SIZE.sm} aria-hidden="true" />
      </Link>
      <span className={styles.monthLabel} aria-live="polite">{formatMonth(month, locale)}</span>
      <Link href={href(shiftMonth(month, 1))} scroll={false} className={styles.monthStep} aria-label={t("nextMonth")}>
        <ChevronRight size={ICON_SIZE.sm} aria-hidden="true" />
      </Link>
    </nav>
  )
}
