import "server-only"
import { redirect } from "next/navigation"
import { getT } from "@/shared/i18n/locale.server"
import { walletsMessages } from "./i18n"
import { type WalletArea, walletPath } from "./paths"
import { loadWallet, type WalletPageProps } from "./wallet.server"
import WalletNotFound from "./ui/WalletNotFound"
import WalletSettingsView from "./ui/WalletSettingsView"

export async function generateMetadata() {
  return { title: (await getT(walletsMessages))("settings") }
}

async function renderSettingsPage({ params }: WalletPageProps, area: WalletArea) {
  const wallet = await loadWallet((await params).id)
  if (!wallet) return <WalletNotFound area={area} />
  // 成員打開設定頁網址時回到錢包頁; 真正擋住修改的是後端的 403。
  if (!wallet.can_manage) redirect(walletPath(wallet.id, area))
  return <WalletSettingsView wallet={wallet} area={area} />
}

export default async function WalletSettingsPage(props: WalletPageProps) {
  return renderSettingsPage(props, "user")
}

export async function AdminWalletSettingsPage(props: WalletPageProps) {
  return renderSettingsPage(props, "admin")
}
