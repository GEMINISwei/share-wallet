import { WalletsPage, generateWalletsMetadata } from "@/modules/wallets/public.server"

export const generateMetadata = generateWalletsMetadata

export default function Page() {
  return <WalletsPage />
}
