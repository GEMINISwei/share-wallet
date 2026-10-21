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

const icon = (Icon: typeof Scale) => <Icon size={ICON_SIZE.sm} />

/**
 * 手機錢包頁 ⋮ 選單。項目與順序由 `walletMenuItems` 決定, 這裡只接上圖示、文字與動作;
 * 頁面沒給動作的項目 (例如資料載入失敗時) 不顯示。
 */
export function useWalletMenu(
  wallet: WalletInfo,
  area: WalletArea,
  { ready, handlers, favorite }: {
    ready: boolean; handlers: MenuHandlers; favorite: MenuItem | null
  },
): MenuItem[] {
  const t = useT(walletsMessages)
  const router = useRouter()
  const go = (href: string) => () => router.push(href)
  const dialog = (key: DialogItem, Icon: typeof Scale, label: string) =>
    handlers[key] ? { icon: icon(Icon), label, onClick: handlers[key] } : null
  const build: Record<WalletMenuItem, () => MenuItem | null> = {
    adjust: () => dialog("adjust", Scale, t("adjustBalance")),
    owing: () => dialog("owing", HandCoins, t("owingList")),
    startSettlement: () => dialog("startSettlement", Flag, t("startSettlement")),
    cancelSettlement: () => dialog("cancelSettlement", Undo2, t("cancelSettlement")),
    netBalances: () => dialog("netBalances", Coins, t("netBalances")),
    members: () => ({ icon: icon(Users), label: t("members"), onClick: go(walletMembersPath(wallet.id, area)) }),
    categories: () => ({
      icon: icon(Tags), label: t("categories"), onClick: go(walletCategoriesPath(wallet.id, area)),
    }),
    history: () => ({ icon: icon(History), label: t("history"), onClick: go(walletHistoryPath(wallet.id, area)) }),
    settings: () => ({
      icon: icon(Settings), label: t("settings"), onClick: go(walletSettingsPath(wallet.id, area)),
    }),
    favorite: () => favorite,
  }
  return walletMenuItems(wallet, ready)
    .map((key) => build[key]())
    .filter((item): item is MenuItem => item !== null)
}
