import {
  AdminWalletMembersPage, generateWalletMembersMetadata, type WalletPageProps,
} from "@/modules/wallets/public.server"

export const generateMetadata = generateWalletMembersMetadata

export default function Page(props: WalletPageProps) {
  return <AdminWalletMembersPage {...props} />
}
