import { TravelWalletsPage, generateTravelWalletsMetadata } from "@/modules/wallets/public.server"

export const generateMetadata = generateTravelWalletsMetadata

export default function Page() {
  return <TravelWalletsPage />
}
