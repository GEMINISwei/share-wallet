import "server-only"
import { apiGet } from "@/shared/api/request.server"
import { getApiItemData } from "@/shared/api/response"

/**
 * 錢包底下每一頁都先取錢包本身。拿不到 (不存在或不是成員, 後端一律 404) 時回傳 null,
 * 由頁面顯示「錢包不存在」—— 不分辨是哪一種, 跟後端一樣不透露錢包存不存在。
 */
export async function loadWallet(id: string) {
  return getApiItemData(await apiGet({ url: "/wallets/{id}", params: { id } }))
}

export type WalletPageProps = {
  params: Promise<{ id: string }>
}
