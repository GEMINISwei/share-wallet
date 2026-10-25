"use client"

import type { CSSProperties, ReactNode } from "react"
import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { useT } from "@/shared/i18n/context"
import { cls, ICON_SIZE, type BaseProps } from "./internals"
import { uiMessages } from "./i18n"
import { PULL_THRESHOLD, pullReducer, pullStatus, type PullState } from "./pull"
import styles from "./styles/pull-to-refresh.module.css"

const STATUS_TEXT = {
  pull: "pullToRefresh",
  release: "releaseToRefresh",
  refreshing: "refreshing",
} as const

type PullToRefreshProps = BaseProps & { children?: ReactNode }

/**
 * 下拉重新整理: 自己就是捲動容器, 捲到最上面往下拉、放開後 `router.refresh()` 重抓伺服器資料。
 *
 * 為什麼自己做: 加到主畫面的 iOS PWA 沒有瀏覽器內建的下拉重新整理; 而捲動容器不是 body 時,
 * 一般瀏覽器內建的也拉不出來。
 *
 * 指示器蓋在內容上往下滑, 不移動內容: 移動內容要用 `transform`, 會讓底下 `position: fixed`
 * 的對話框與通知改成跟著容器定位。
 */
export function PullToRefresh({ as: Component = "div", className, style, children }: PullToRefreshProps) {
  const t = useT(uiMessages)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [state, setState] = useState<PullState>({ phase: "idle" })
  // 觸控事件是原生監聽器, 讀不到最新的 render; 狀態另外記一份給它們用。
  const stateRef = useRef(state)
  const containerRef = useRef<HTMLElement>(null)

  const apply = useCallback((event: Parameters<typeof pullReducer>[1]) => {
    const next = pullReducer(stateRef.current, event)
    stateRef.current = next
    setState(next)
    return next
  }, [])

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const container = node

    function onStart(event: TouchEvent) {
      // 對話框開著時手勢是對話框的, 不在頂端時是一般捲動。
      const atTop = container.scrollTop <= 0 && !container.querySelector('[aria-modal="true"]')
      apply({ type: "start", y: event.touches[0].clientY, atTop })
    }
    function onMove(event: TouchEvent) {
      const next = apply({ type: "move", y: event.touches[0].clientY })
      // 拉動中由這裡接手, 不讓瀏覽器同時捲動或回彈; 往上滑 (位移 0) 照常捲動。
      if (next.phase === "pulling" && next.offset > 0 && event.cancelable) event.preventDefault()
    }
    function onEnd() {
      const wasRefreshing = stateRef.current.phase === "refreshing"
      const next = apply({ type: "end" })
      if (!wasRefreshing && next.phase === "refreshing") startTransition(() => router.refresh())
    }
    // 系統手勢搶走觸控時 (例如 iOS 的邊緣返回) 當作沒拉過, 不能當成放開而觸發。
    function onCancel() {
      apply({ type: "start", y: 0, atTop: false })
    }

    // touchmove 不能是 passive, 否則 preventDefault 無效。
    container.addEventListener("touchstart", onStart, { passive: true })
    container.addEventListener("touchmove", onMove, { passive: false })
    container.addEventListener("touchend", onEnd)
    container.addEventListener("touchcancel", onCancel)
    return () => {
      container.removeEventListener("touchstart", onStart)
      container.removeEventListener("touchmove", onMove)
      container.removeEventListener("touchend", onEnd)
      container.removeEventListener("touchcancel", onCancel)
    }
  }, [apply, router])

  // `router.refresh()` 的新畫面 render 完, transition 才結束。
  useEffect(() => {
    if (state.phase === "refreshing" && !isPending) apply({ type: "done" })
  }, [apply, state.phase, isPending])

  const status = pullStatus(state)
  const offset = state.phase === "refreshing" ? PULL_THRESHOLD : state.phase === "pulling" ? state.offset : 0
  const indicatorStyle = {
    "--pull-offset": `${offset}px`,
    "--pull-progress": Math.min(offset / PULL_THRESHOLD, 1),
  } as CSSProperties

  return (
    <Component ref={containerRef} className={cls(styles.container, className)} style={style}>
      <div className={styles.indicatorTrack} aria-hidden>
        <div
          className={cls(styles.indicator, status !== null && styles.indicatorVisible, status === "pull" && styles.dragging)}
          style={indicatorStyle}
        >
          <RefreshCw size={ICON_SIZE.md} className={cls(styles.icon, status === "refreshing" && styles.spinning)} />
        </div>
      </div>
      <span role="status" className={styles.statusText}>{status ? t(STATUS_TEXT[status]) : ""}</span>
      {children}
    </Component>
  )
}
