"use client"

import { PageHeader } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { settingsMessages } from "../i18n"
import PasswordSettings from "./PasswordSettings"
import ProfileSettings from "./ProfileSettings"
import styles from "./settings.module.css"

// 使用者對自己帳號的操作都集中在這一頁; 後台的使用者管理只有超級管理者進得去。
export default function UserSettingsView({ nickname }: { nickname: string }) {
  const t = useT(settingsMessages)

  return (
    <div className={styles.page}>
      <PageHeader title={t("userPageTitle")} />
      <div className={styles.content}>
        <ProfileSettings nickname={nickname} />
        <PasswordSettings />
      </div>
    </div>
  )
}
