import {
  AdminWalletsPage, generateAdminWalletsMetadata, type AdminWalletsPageProps,
} from "@/modules/wallets/public.server"

export const generateMetadata = generateAdminWalletsMetadata

export default function Page(props: AdminWalletsPageProps) {
  return <AdminWalletsPage {...props} />
}
