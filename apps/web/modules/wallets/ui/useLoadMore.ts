"use client"

import { useState, useTransition } from "react"
import type { ApiResponse } from "@/shared/api/contract"

type Page<T> = { list_data: T[]; next_cursor: string | null }

/**
 * 「載入更多」: 第一頁由伺服器 render, 之後的頁接在後面。第一頁換了 (記帳後 `router.refresh()`)
 * 就丟掉接在後面的頁: 它們不會跟著更新, 留著會跟新的第一頁重複或過時。
 * 不靠呼叫端換 `key` 重新掛載: 寫入成功當下重新掛載時 refresh 還沒回來, 拿到的仍是舊的第一頁。
 */
export function useLoadMore<T>(
  first: Page<T>,
  load: (cursor: string) => Promise<ApiResponse<Page<T>>>,
) {
  const [loaded, setLoaded] = useState<{ first: Page<T>; more: Page<T>[] }>({ first, more: [] })
  if (loaded.first !== first) setLoaded({ first, more: [] })
  const pages = loaded.first === first ? [first, ...loaded.more] : [first]
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
      setLoaded((current) => ({ ...current, more: [...current.more, res.data] }))
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
