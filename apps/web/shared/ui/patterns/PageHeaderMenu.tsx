"use client"

import { MoreHorizontal } from "lucide-react"
import { useT } from "@/shared/i18n/context"
import { uiMessages } from "../i18n"
import { ICON_SIZE } from "../internals"
import Menu, { type MenuItem } from "./Menu"

type PageHeaderMenuProps = {
  items: (MenuItem | null | false | undefined)[]
  triggerClassName: string
  /** 給了就開成以它為標題的底部面板; 沒給是一般的下拉。 */
  sheetTitle?: string
}

/** 手機標題列右邊的「⋯」: 這一頁其餘的操作都收在這裡。 */
export default function PageHeaderMenu(
  { items, triggerClassName, sheetTitle }: PageHeaderMenuProps,
) {
  const t = useT(uiMessages)
  if (!items.some(Boolean)) return null

  return (
    <Menu
      items={items}
      trigger={<MoreHorizontal size={ICON_SIZE.md} aria-hidden="true" />}
      triggerLabel={t("moreActions")}
      triggerClassName={triggerClassName}
      sheetTitle={sheetTitle}
    />
  )
}
