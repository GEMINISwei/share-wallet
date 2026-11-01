"use client"

import { useT } from "@/shared/i18n/context"
import { walletsMessages } from "../i18n"
import type { WalletGroupInfo } from "../types"

/** 群組的顯示名稱。預設群組沒有名稱, 跟著語系顯示「未分組」。 */
export function useGroupLabel() {
  const t = useT(walletsMessages)
  return (group: Pick<WalletGroupInfo, "name">) => group.name ?? t("defaultGroup")
}
