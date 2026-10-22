"use client"

import { MoreHorizontal } from "lucide-react"
import { ICON_SIZE, type MenuItem, MenuSheet } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { walletsMessages } from "../i18n"
import styles from "./wallets.module.css"

type WalletQuickActionsProps = {
  title: string
  quick: MenuItem[]
  more: MenuItem[]
}

/**
 * 手機錢包頁餘額下方的一排操作。最後一格「更多」是其餘的選單項目, 開成底部面板;
 * 這裡就是手機上這些操作唯一的入口, 標題列不再放 ⋮。桌機用標題列與頁面下方的連結。
 */
export default function WalletQuickActions({ title, quick, more }: WalletQuickActionsProps) {
  const t = useT(walletsMessages)
  if (quick.length === 0 && more.length === 0) return null
  return (
    <div className={`${styles.quickActions} ${styles.mobileOnly}`}>
      {quick.map((item) => (
        <button key={item.label} type="button" className={styles.quickAction} onClick={item.onClick}>
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
      <MenuSheet
        title={title}
        triggerLabel={t("moreActions")}
        triggerClassName={styles.quickAction}
        items={more}
        trigger={
          <>
            <MoreHorizontal size={ICON_SIZE.md} aria-hidden="true" />
            <span>{t("moreActions")}</span>
          </>
        }
      />
    </div>
  )
}
