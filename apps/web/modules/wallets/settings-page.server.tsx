import "server-only"
import { redirect } from "next/navigation"
import { getT } from "@/shared/i18n/locale.server"
import { walletsMessages } from "./i18n"
import { walletPath } from "./paths"
import { loadWallet, type WalletPageProps } from "./wallet.server"
import WalletNotFound from "./ui/WalletNotFound"
import WalletSettingsView from "./ui/WalletSettingsView"

export async function generateMetadata() {
  return { title: (await getT(walletsMessages))("settings") }
}

export default async function WalletSettingsPage({ params }: WalletPageProps) {
  const wallet = await loadWallet((await params).id)
  if (!wallet) return <WalletNotFound />
  // 成員打開設定頁網址時回到錢包頁; 真正擋住修改的是後端的 403。
  if (!wallet.can_manage) redirect(walletPath(wallet.id))
  return <WalletSettingsView wallet={wallet} />
}
