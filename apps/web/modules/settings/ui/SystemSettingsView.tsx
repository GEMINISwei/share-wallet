"use client"

import { PageHeader } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { settingsMessages } from "../i18n"
import AboutSettings from "./AboutSettings"
import LanguageSettings from "./LanguageSettings"
import styles from "./settings.module.css"

// 跟帳號資料無關的設定: 語系存在這台裝置的 cookie, 版本是系統資訊。
export default function SystemSettingsView({ version }: { version: string }) {
  const t = useT(settingsMessages)

  return (
    <div className={styles.page}>
      <PageHeader title={t("systemPageTitle")} />
      <div className={styles.content}>
        <LanguageSettings />
        <AboutSettings version={version} />
      </div>
    </div>
  )
}
