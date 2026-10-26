"use client"

import { MoreHorizontal } from "lucide-react"
import { useT } from "@/shared/i18n/context"
import { uiMessages } from "../i18n"
import { ICON_SIZE } from "../internals"
import Menu, { type MenuItem } from "./Menu"

type PageHeaderMenuProps = {
  items: (MenuItem | null | false | undefined)[]
  triggerClassName: string
}

/**
 * 手機標題列右邊的「⋯」: 這一頁其餘的操作都收在這裡, 開成只列項目的底部面板。
 * 不放標題: 點的是這一頁右上角, 面板屬於哪一頁已經很清楚。
 */
export default function PageHeaderMenu({ items, triggerClassName }: PageHeaderMenuProps) {
  const t = useT(uiMessages)

  return (
    <Menu
      sheet
      items={items}
      trigger={<MoreHorizontal size={ICON_SIZE.md} aria-hidden="true" />}
      triggerLabel={t("moreActions")}
      triggerClassName={triggerClassName}
    />
  )
}
