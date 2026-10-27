"use client"

import { useT } from "@/shared/i18n/context"
import { walletsMessages } from "../i18n"
import type { WalletGroupInfo } from "../types"

/** 群組的顯示名稱。預設群組沒有名稱, 跟著語系顯示。 */
export function useGroupLabel() {
  const t = useT(walletsMessages)
  return (group: Pick<WalletGroupInfo, "name" | "kind">) => group.name
    ?? (group.kind === "travel" ? t("defaultTravelGroup") : t("defaultGeneralGroup"))
}
