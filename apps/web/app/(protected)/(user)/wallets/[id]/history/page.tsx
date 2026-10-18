import {
  WalletHistoryPage, generateWalletHistoryMetadata, type WalletPageProps,
} from "@/modules/wallets/public.server"

export const generateMetadata = generateWalletHistoryMetadata

export default function Page(props: WalletPageProps) {
  return <WalletHistoryPage {...props} />
}
