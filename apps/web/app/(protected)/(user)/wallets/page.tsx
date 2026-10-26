import {
  WalletsPage, generateWalletsMetadata, type WalletsPageProps,
} from "@/modules/wallets/public.server"

export const generateMetadata = generateWalletsMetadata

export default function Page(props: WalletsPageProps) {
  return <WalletsPage {...props} />
}
