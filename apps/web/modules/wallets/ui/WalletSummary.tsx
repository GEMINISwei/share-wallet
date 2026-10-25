"use client"

import { Plus } from "lucide-react"
import { Button, ICON_SIZE } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { walletsMessages } from "../i18n"
import Amount from "./Amount"
import styles from "./wallets.module.css"

type WalletSummaryProps = {
  label: string
  /** 沒有數字可顯示時 (例如沒加入的超級管理者沒有淨額) 只留「記一筆」。 */
  value: number | null
  /** 不能記帳時不給, 按鈕就不出現。 */
  onAdd?: () => void
  /** 只在手機顯示: 桌機的旅遊錢包頁沒有摘要列。 */
  mobileOnly?: boolean
}

/**
 * 錢包頁最上方的摘要列。「記一筆」只在手機放在這裡 (桌機在標題列),
 * 理由見 docs/features.md〈錢包頁的版面〉。
 */
export default function WalletSummary(
  { label, value, onAdd, mobileOnly = false }: WalletSummaryProps,
) {
  const t = useT(walletsMessages)
  if (value === null && !onAdd) return null
  return (
    <section className={[styles.summary, mobileOnly && styles.mobileOnly].filter(Boolean).join(" ")}>
      {value !== null && (
        <div className={styles.summaryMain}>
          <span className={styles.summaryLabel}>{label}</span>
          <Amount value={value} className={styles.summaryValue} />
        </div>
      )}
      {onAdd && (
        <div className={styles.summaryAdd}>
          <Button icon={<Plus size={ICON_SIZE.sm} />} onClick={onAdd}>{t("addEntry")}</Button>
        </div>
      )}
    </section>
  )
}
