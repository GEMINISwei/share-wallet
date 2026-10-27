"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { useT } from "@/shared/i18n/context"
import { cls, ICON_SIZE } from "./internals"
import { uiMessages } from "./i18n"
import styles from "./styles/page-header.module.css"

/**
 * 標題列的重整: `router.refresh()` 重抓伺服器資料。
 *
 * 為什麼需要: 加到主畫面的 iOS PWA 沒有瀏覽器的重新整理; 別人記的帳不會自己出現。
 * 新畫面 render 完 transition 才結束, 這段期間停用, 連點不會重抓好幾次。
 */
export default function RefreshButton({ className }: { className?: string }) {
  const t = useT(uiMessages)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <button
      type="button"
      className={className}
      aria-label={t("reload")}
      aria-busy={isPending}
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <RefreshCw size={ICON_SIZE.md} className={cls(isPending && styles.spinning)} aria-hidden="true" />
    </button>
  )
}
