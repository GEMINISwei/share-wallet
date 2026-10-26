import "server-only"
import { getT } from "@/shared/i18n/locale.server"
import { parseInviteToken } from "@/modules/wallets/public.client"
import { authMessages } from "./i18n"
import SignupForm from "./ui/SignupForm"

export async function generateMetadata() {
  return { title: (await getT(authMessages))("signupTitle") }
}

export type SignupPageProps = {
  searchParams?: Promise<{ invite?: string | string[] }>
}

// 公開註冊一般帳號。角色由後端固定為一般用戶; 超級管理者只能用 CLI 建立 (`make db superuser`)。
// 從邀請連結來的帶著 `invite`, 註冊完停在確認頁。
export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams
  return <SignupForm invite={parseInviteToken(params?.invite)} />
}
