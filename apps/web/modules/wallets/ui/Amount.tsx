"use client"

import { useLocale } from "@/shared/i18n/context"
import { formatAmount } from "../format"
import styles from "./wallets.module.css"

type AmountProps = {
  value: number
  className?: string
  /** 帳目的增減: 正數帶「+」並用收入的顏色, 一眼分得出進出。餘額這類數字不要開。 */
  signed?: boolean
}

/** 金額; 負數 (例如記信用卡的錢包) 用警示色。 */
export default function Amount({ value, className, signed = false }: AmountProps) {
  const locale = useLocale()
  const positive = signed && value > 0
  const classes = [
    styles.amount, value < 0 && styles.negative, positive && styles.positive, className,
  ]
  const text = formatAmount(value, locale)
  return <span className={classes.filter(Boolean).join(" ")}>{positive ? `+${text}` : text}</span>
}
