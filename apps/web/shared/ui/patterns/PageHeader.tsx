import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import type { ReactNode } from "react"
import { ICON_SIZE } from "../internals"
import styles from "../styles/page-header.module.css"
import ActionMenu, { type ActionMenuItem } from "./ActionMenu"

type PageHeaderProps = {
  title: string
  subtitle?: string
  /** 回上一層。只在手機顯示成標題左邊的圓鈕; 桌機由頁面自己放返回連結。 */
  back?: { href: string; label: string }
  actions?: ReactNode
  mobileActions?: (ActionMenuItem | null | false | undefined)[]
  /** `actions` 只在桌機顯示: 手機把這些操作放在頁面裡 (例如一排按鈕), 標題列不再放一份。 */
  actionsDesktopOnly?: boolean
}

/**
 * 頁面標題列。手機是「左圓鈕｜置中標題｜右圓鈕」: 兩側等寬, 標題才會真的在正中間;
 * 沒有返回或選單的那一側留空。
 */
export default function PageHeader({
  title, subtitle, back, actions, mobileActions, actionsDesktopOnly = false,
}: PageHeaderProps) {
  const actionsClass = actionsDesktopOnly
    ? `${styles.pageHeaderActions} ${styles.desktopOnlyActions}`
    : styles.pageHeaderActions
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeaderStart}>
        {back && (
          <Link href={back.href} className={styles.circleButton} aria-label={back.label}>
            <ChevronLeft size={ICON_SIZE.md} aria-hidden="true" />
          </Link>
        )}
      </div>
      <div className={styles.pageHeaderText}>
        <h1 className={styles.pageTitle}>{title}</h1>
        {subtitle && <p className={styles.pageSubtitle}>{subtitle}</p>}
      </div>
      <div className={styles.pageHeaderEnd}>
        {actions && <div className={actionsClass}>{actions}</div>}
        {mobileActions && (
          <div className={styles.pageHeaderMobileActions}>
            <ActionMenu items={mobileActions} triggerClassName={styles.circleButton} />
          </div>
        )}
      </div>
    </header>
  )
}
