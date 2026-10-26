import "server-only"
import { getCurrentUser } from "@/modules/auth/public.server"
import { getT } from "@/shared/i18n/locale.server"
import { settingsMessages } from "./i18n"
import UserSettingsView from "./ui/UserSettingsView"

export async function generateMetadata() {
  return { title: (await getT(settingsMessages))("userPageTitle") }
}

export default async function UserSettingsPage() {
  // getCurrentUser() 有 React `cache()`, 同一次 render 內與外殼共用同一筆結果。
  const { data } = await getCurrentUser()
  return <UserSettingsView nickname={data?.nickname ?? ""} />
}
