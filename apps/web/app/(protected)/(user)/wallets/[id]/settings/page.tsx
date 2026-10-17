import {
  WalletSettingsPage, generateWalletSettingsMetadata, type WalletPageProps,
} from "@/modules/wallets/public.server"

export const generateMetadata = generateWalletSettingsMetadata

export default function Page(props: WalletPageProps) {
  return <WalletSettingsPage {...props} />
}
