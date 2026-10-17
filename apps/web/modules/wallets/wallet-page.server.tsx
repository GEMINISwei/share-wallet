import "server-only"
import { getT } from "@/shared/i18n/locale.server"
import { walletsMessages } from "./i18n"
import type { WalletArea } from "./paths"
import { loadWallet, type WalletPageProps } from "./wallet.server"
import WalletNotFound from "./ui/WalletNotFound"
import WalletView from "./ui/WalletView"

export type { WalletPageProps } from "./wallet.server"

export async function generateMetadata({ params }: WalletPageProps) {
  const wallet = await loadWallet((await params).id)
  return { title: wallet?.name ?? (await getT(walletsMessages))("notFound") }
}

async function renderWalletPage({ params }: WalletPageProps, area: WalletArea) {
  const wallet = await loadWallet((await params).id)
  if (!wallet) return <WalletNotFound area={area} />
  return <WalletView wallet={wallet} area={area} />
}

export default async function WalletPage(props: WalletPageProps) {
  return renderWalletPage(props, "user")
}

export async function AdminWalletPage(props: WalletPageProps) {
  return renderWalletPage(props, "admin")
}
