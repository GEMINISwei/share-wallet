import { WalletGroupsPage, generateWalletGroupsMetadata } from "@/modules/wallets/public.server"

export const generateMetadata = generateWalletGroupsMetadata

export default function Page() {
  return <WalletGroupsPage />
}
