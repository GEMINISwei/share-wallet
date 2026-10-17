"use client"

import { Container, ErrorState, PageHeader } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { walletsMessages } from "../i18n"
import { WALLETS_PATH } from "../manifest"
import BackLink from "./BackLink"
import styles from "./wallets.module.css"

// 不存在與不是成員顯示同一個畫面, 跟後端一樣不透露錢包存不存在。
export default function WalletNotFound() {
  const t = useT(walletsMessages)
  return (
    <Container size="lg" padded>
      <PageHeader title={t("notFound")} />
      <div className={styles.content}>
        <BackLink href={WALLETS_PATH} label={t("backToList")} />
        <ErrorState>{t("notFoundDesc")}</ErrorState>
      </div>
    </Container>
  )
}
