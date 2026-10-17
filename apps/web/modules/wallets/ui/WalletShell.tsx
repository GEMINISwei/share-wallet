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
} & Pick<ComponentProps<typeof PageHeader>, "actions" | "mobileActions">

/** 錢包底下各頁的共同外框: 標題、回上一層的連結、單欄內容。 */
export default function WalletShell({
  title, subtitle, backHref, backLabel, children, actions, mobileActions,
}: WalletShellProps) {
  return (
    <Container size="lg" padded>
      <PageHeader
        title={title} subtitle={subtitle} actions={actions} mobileActions={mobileActions}
      />
      <div className={styles.content}>
        <BackLink href={backHref} label={backLabel} />
        {children}
      </div>
    </Container>
  )
}
