"use client"

import { Coins, Flag, HandCoins, History, Scale, Settings, Tags, Undo2, Users } from "lucide-react"
import { useRouter } from "next/navigation"
import { ICON_SIZE, type MenuItem } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { type WalletMenuItem, walletMenuItems } from "../capabilities"
import { walletsMessages } from "../i18n"
import {
  type WalletArea, walletCategoriesPath, walletHistoryPath, walletMembersPath, walletSettingsPath,
} from "../paths"
import type { WalletInfo } from "../types"

/** 在頁面上開對話框的項目; 其餘是連到別頁, 或是最愛。 */
type DialogItem = Extract<
  WalletMenuItem, "adjust" | "owing" | "startSettlement" | "cancelSettlement" | "netBalances"
>
type MenuHandlers = Partial<Record<DialogItem, () => void>>

const ICONS: Record<Exclude<WalletMenuItem, "favorite">, typeof Scale> = {
  adjust: Scale, owing: HandCoins, startSettlement: Flag, cancelSettlement: Undo2,
  netBalances: Coins, members: Users, categories: Tags, history: History, settings: Settings,
}

const LABELS = {
  adjust: "adjustBalance", owing: "owingList", startSettlement: "startSettlement",
  cancelSettlement: "cancelSettlement", netBalances: "netBalances", members: "members",
  categories: "categories", history: "history", settings: "settings",
} as const satisfies Record<Exclude<WalletMenuItem, "favorite">, string>

/**
 * 手機錢包頁標題列「⋯」的項目。項目與順序由 `walletMenuItems` 決定, 這裡只接上圖示、文字與動作;
 * 頁面沒給動作的項目 (例如資料載入失敗時) 不顯示。
 */
export function useWalletMenu(
  wallet: WalletInfo,
  area: WalletArea,
  { state, handlers, favorite }: {
    state: Parameters<typeof walletMenuItems>[1]; handlers: MenuHandlers; favorite: MenuItem | null
  },
): MenuItem[] {
  const t = useT(walletsMessages)
  const router = useRouter()
  const links: Record<Extract<WalletMenuItem, "members" | "categories" | "history" | "settings">, string> = {
    members: walletMembersPath(wallet.id, area),
    categories: walletCategoriesPath(wallet.id, area),
    history: walletHistoryPath(wallet.id, area),
    settings: walletSettingsPath(wallet.id, area),
  }

  function toItem(key: WalletMenuItem): MenuItem | null {
    if (key === "favorite") return favorite
    const Icon = ICONS[key]
    const onClick = key in links
      ? () => router.push(links[key as keyof typeof links])
      : handlers[key as DialogItem]
    if (!onClick) return null
    return { icon: <Icon size={ICON_SIZE.sm} />, label: t(LABELS[key]), onClick }
  }

  return walletMenuItems(wallet, state)
    .map(toItem)
    .filter((item): item is MenuItem => item !== null)
}
