import {
  WalletGroupPage, generateWalletGroupMetadata, type WalletGroupPageProps,
} from "@/modules/wallets/public.server"

export const generateMetadata = generateWalletGroupMetadata

export default function Page(props: WalletGroupPageProps) {
  return <WalletGroupPage {...props} />
}
