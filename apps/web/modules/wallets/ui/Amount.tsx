"use client"

import { useLocale } from "@/shared/i18n/context"
import { formatAmount } from "../format"
import styles from "./wallets.module.css"

/** 金額; 負數 (例如記信用卡的錢包) 用警示色。 */
export default function Amount({ value, className }: { value: number; className?: string }) {
  const locale = useLocale()
  const classes = [styles.amount, value < 0 && styles.negative, className].filter(Boolean)
  return <span className={classes.join(" ")}>{formatAmount(value, locale)}</span>
}
