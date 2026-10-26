import {
  WalletPage, generateWalletMetadata, type WalletPageProps,
} from "@/modules/wallets/public.server"

export const generateMetadata = generateWalletMetadata

export default function Page(props: WalletPageProps) {
  return <WalletPage {...props} />
}
