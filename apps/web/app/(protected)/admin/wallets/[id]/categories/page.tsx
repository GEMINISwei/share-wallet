import {
  AdminWalletCategoriesPage, generateWalletCategoriesMetadata, type WalletPageProps,
} from "@/modules/wallets/public.server"

export const generateMetadata = generateWalletCategoriesMetadata

export default function Page(props: WalletPageProps) {
  return <AdminWalletCategoriesPage {...props} />
}
