"use client"

import { Container, PageHeader } from "@/shared/ui"
import type { ComponentProps } from "react"
import BackLink from "./BackLink"
import styles from "./wallets.module.css"

type WalletShellProps = {
  title: string
  subtitle?: string
  backHref: string
  backLabel: string
  children: React.ReactNode
} & Pick<ComponentProps<typeof PageHeader>, "actions" | "actionsDesktopOnly" | "mobileActions">

/** 錢包底下各頁的共同外框: 標題、回上一層 (手機在標題列, 桌機在內容上方)、單欄內容。 */
export default function WalletShell({
  title, subtitle, backHref, backLabel, children, actions, actionsDesktopOnly, mobileActions,
}: WalletShellProps) {
  return (
    <Container size="lg" padded>
      <PageHeader
        title={title} subtitle={subtitle} back={{ href: backHref, label: backLabel }}
        actions={actions} actionsDesktopOnly={actionsDesktopOnly} mobileActions={mobileActions}
      />
      <div className={styles.content}>
        {/* 手機的返回是標題列左邊的圓鈕。 */}
        <div className={styles.desktopOnly}><BackLink href={backHref} label={backLabel} /></div>
        {children}
      </div>
    </Container>
  )
}
