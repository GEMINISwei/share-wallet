import "server-only"
import { apiGet } from "@/shared/api/request.server"
import { getApiItemData } from "@/shared/api/response"
import { getT } from "@/shared/i18n/locale.server"
import { settingsMessages } from "./i18n"
import SystemSettingsView from "./ui/SystemSettingsView"

export async function generateMetadata() {
  return { title: (await getT(settingsMessages))("systemPageTitle") }
}

export default async function SystemSettingsPage() {
  const [versionRes, t] = await Promise.all([
    // 版號以後端的 APP_VERSION 為準: 只有它跟著發版, web 的 package.json 不跟。
    apiGet({ url: "/system/version" }),
    getT(settingsMessages),
  ])
  const version = getApiItemData(versionRes)?.version ?? t("versionUnavailable")
  return <SystemSettingsView version={version} />
}
