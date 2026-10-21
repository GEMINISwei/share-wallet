"use client"

import { useState } from "react"
import { Modal } from "../dialogs"
import { cls } from "../internals"
import styles from "../styles/action-menu.module.css"
import type { MenuItem } from "./Menu"

type MenuSheetProps = {
  items: (MenuItem | null | false | undefined)[]
  /** 面板頂端的標題, 同時是對話框的無障礙名稱。 */
  title: string
  trigger: React.ReactNode
  triggerLabel: string
  triggerClassName?: string
}

/**
 * 跟 `Menu` 同一份項目, 但開成對話框: 手機寬度下 `Modal` 是從底部滑出的面板。
 *
 * 給手機底部導覽這類用手指點的觸發點用 —— 往上彈的小選單項目太擠、離拇指太遠,
 * 面板的每一列都有完整的觸控高度。
 */
export default function MenuSheet({
  items, title, trigger, triggerLabel, triggerClassName,
}: MenuSheetProps) {
  const [open, setOpen] = useState(false)
  const visibleItems = items.filter((item): item is MenuItem => Boolean(item))

  if (visibleItems.length === 0) return null

  return (
    <>
      <button
        type="button"
        className={triggerClassName ?? styles.trigger}
        onClick={() => setOpen(true)}
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {trigger}
      </button>
      <Modal title={title} open={open} onOpenChange={setOpen}>
        <div className={styles.sheetList} role="menu" aria-label={title}>
          {visibleItems.map((item, index) => (
            <button
              key={index}
              type="button"
              role="menuitem"
              className={cls(styles.sheetItem, item.color === "error" && styles.itemError)}
              onClick={() => {
                setOpen(false)
                item.onClick()
              }}
            >
              {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      </Modal>
    </>
  )
}
