import {
  WalletMembersPage, generateWalletMembersMetadata, type WalletPageProps,
} from "@/modules/wallets/public.server"

export const generateMetadata = generateWalletMembersMetadata

export default function Page(props: WalletPageProps) {
  return <WalletMembersPage {...props} />
}
