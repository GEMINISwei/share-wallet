import { redirect } from "next/navigation"
import { WALLETS_PATH } from "@/modules/wallets/public.server"

// 這個 app 的首頁就是錢包列表。保留 `/` 這個入口 (登入後預設導到這裡), 再轉過去。
export default function HomePage() {
  redirect(WALLETS_PATH)
}
