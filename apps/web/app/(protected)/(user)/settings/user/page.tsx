import { UserSettingsPage, generateUserSettingsMetadata } from "@/modules/settings/public.server"

export const generateMetadata = generateUserSettingsMetadata

export default function Page() {
  return <UserSettingsPage />
}
