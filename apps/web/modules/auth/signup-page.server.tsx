import "server-only"
import { getT } from "@/shared/i18n/locale.server"
import { authMessages } from "./i18n"
import SignupForm from "./ui/SignupForm"

export async function generateMetadata() {
  return { title: (await getT(authMessages))("signupTitle") }
}

// 公開註冊一般帳號。角色由後端固定為一般用戶; 超級管理者只能用 CLI 建立 (`make db superuser`)。
export default function SignupPage() {
  return <SignupForm />
}
