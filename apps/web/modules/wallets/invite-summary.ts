import { translate } from "@/shared/i18n/dictionary"
import type { Locale } from "@/shared/i18n/locale"
import { walletsMessages } from "./i18n"
import type { InvitePreview } from "./types"

/**
 * 確認頁標題下的一行說明, 讓人確認點的是對的錢包 (見 docs/features/members.md〈加入流程〉):
 * 類型、成員數, 旅遊錢包另外帶目的地與日期 (寫法與錢包列表相同)。
 */
export function inviteSummary(preview: InvitePreview, locale: Locale) {
  const t = translate(walletsMessages, locale)
  const parts = [preview.kind === "travel" ? t("kindTravel") : t("kindGeneral")]
  if (preview.kind === "travel") {
    parts.push(preview.destination ?? "")
    parts.push(t("dateRange", { start: preview.start_date ?? "", end: preview.end_date ?? "" }))
  }
  parts.push(t("joinMembers", { count: preview.member_count }))
  return parts.join(" · ")
}
