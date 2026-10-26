import { SystemSettingsPage, generateSystemSettingsMetadata } from "@/modules/settings/public.server"

export const generateMetadata = generateSystemSettingsMetadata

export default function Page() {
  return <SystemSettingsPage />
}
