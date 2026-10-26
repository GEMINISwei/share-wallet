import Link from "next/link"
import styles from "../styles/link-tabs.module.css"

type LinkTab = { href: string; label: string; active: boolean }

/**
 * 以網址切換的分頁。切換是換網址而不是 client state: 返回、重新整理與分享連結都停在同一個分頁。
 */
export default function LinkTabs({ tabs, label }: { tabs: LinkTab[]; label: string }) {
  return (
    <nav aria-label={label} className={styles.tabs}>
      {tabs.map((tab) => (
        <Link
          key={tab.href} href={tab.href} replace scroll={false}
          aria-current={tab.active ? "page" : undefined}
          className={`${styles.tab} ${tab.active ? styles.tabActive : ""}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
