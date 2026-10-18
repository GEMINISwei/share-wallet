"use client"

import { useState, useTransition } from "react"
import type { ApiResponse } from "@/shared/api/contract"

type Page<T> = { list_data: T[]; next_cursor: string | null }

/**
 * 「載入更多」: 第一頁由伺服器 render, 之後的頁接在後面。第一頁換了 (記帳後 `router.refresh()`)
 * 時呼叫端要用 `key` 重新掛載, 不然接在後面的舊頁會跟新的第一頁重複或過時。
 */
export function useLoadMore<T>(
  first: Page<T>,
  load: (cursor: string) => Promise<ApiResponse<Page<T>>>,
) {
  const [pages, setPages] = useState<Page<T>[]>([first])
  const [failed, setFailed] = useState(false)
  const [isPending, startTransition] = useTransition()
  const cursor = pages[pages.length - 1].next_cursor

  function loadMore() {
    if (!cursor) return
    setFailed(false)
    startTransition(async () => {
      const res = await load(cursor)
      if (res.status !== "success") {
        setFailed(true)
        return
      }
      setPages((current) => [...current, res.data])
    })
  }

  return {
    items: pages.flatMap((page) => page.list_data),
    hasMore: cursor !== null,
    isPending,
    failed,
    loadMore,
  }
}
