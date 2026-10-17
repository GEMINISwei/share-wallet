import "server-only"
import { getT } from "@/shared/i18n/locale.server"
import { walletsMessages } from "./i18n"
import { loadWallet, type WalletPageProps } from "./wallet.server"
import WalletNotFound from "./ui/WalletNotFound"
import WalletView from "./ui/WalletView"

export type { WalletPageProps } from "./wallet.server"

export async function generateMetadata({ params }: WalletPageProps) {
  const wallet = await loadWallet((await params).id)
  return { title: wallet?.name ?? (await getT(walletsMessages))("notFound") }
}

export default async function WalletPage({ params }: WalletPageProps) {
  const wallet = await loadWallet((await params).id)
  if (!wallet) return <WalletNotFound />
  return <WalletView wallet={wallet} />
}
