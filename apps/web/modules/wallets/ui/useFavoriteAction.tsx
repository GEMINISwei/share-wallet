"use client"

import { Star, StarOff } from "lucide-react"
import { useRouter } from "next/navigation"
import { ICON_SIZE, useActionSubmit } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { setFavorite } from "../actions"
import { walletsMessages } from "../i18n"
import type { WalletInfo } from "../types"

/**
 * 錢包頁選單裡的「加入／取消最愛」。最愛記在自己的成員紀錄上, 沒加入的超級管理者沒有這一項
 * (見 docs/features.md〈錢包列表〉)。
 */
type Notify = { success: (message: string) => void; error: (message: string) => void }

export function useFavoriteAction(wallet: WalletInfo, notify: Notify) {
  const t = useT(walletsMessages)
  const router = useRouter()
  const { submit } = useActionSubmit()
  if (wallet.my_role === null) return null

  const next = !wallet.is_favorite
  return {
    icon: next ? <Star size={ICON_SIZE.sm} /> : <StarOff size={ICON_SIZE.sm} />,
    label: next ? t("addFavorite") : t("removeFavorite"),
    onClick: () => submit(() => setFavorite(wallet.id, next), {
      onSuccess: () => {
        notify.success(next ? t("favoriteAdded") : t("favoriteRemoved"))
        router.refresh()
      },
      onError: notify.error,
      errorFallback: t("favoriteFailed"),
    }),
  }
}
