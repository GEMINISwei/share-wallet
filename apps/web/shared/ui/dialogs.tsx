"use client"

import type { FormEvent, ReactNode } from "react"
import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { useT } from "@/shared/i18n/context"
import { cls, ICON_SIZE } from "./internals"
import styles from "./styles/primitives.module.css"
import { uiMessages } from "./i18n"
import { Button } from "./primitives"

type ModalProps = {
  title?: string
  /** 標題下方的一行說明, 例如這張表單作用在哪個錢包。 */
  subtitle?: string
  open: boolean
  children?: ReactNode
  width?: number
  /**
   * 手機上佔滿整個畫面 (關閉在左上、標題置中), 給要專心填的表單用; 桌機照常是對話框。
   * 一般的底部面板只佔需要的高度, 長表單會被鍵盤擠到只剩一小塊。
   */
  fullScreen?: boolean
  onOpenChange?: (open: boolean) => void
}

export function Modal({
  title, subtitle, open, children, width, fullScreen = false, onOpenChange,
}: ModalProps) {
  const t = useT(uiMessages)
  const onOpenChangeRef = useRef(onOpenChange)
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => { onOpenChangeRef.current = onOpenChange }, [onOpenChange])
  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChangeRef.current?.(false)
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open])
  useEffect(() => {
    if (!open) return
    const node = dialogRef.current
    if (!node || node.contains(document.activeElement)) return
    const target = node.querySelector<HTMLElement>("[autofocus]") ?? node
    target.focus({ preventScroll: true })
  }, [open])

  if (!open) return null
  // 掛到 body: 外層只要有 `transform`／`filter`／`backdrop-filter` (例如底部導覽的毛玻璃),
  // 遮罩的 `position: fixed` 就會改以那一層為範圍, 只蓋住那一小塊而且點外面關不掉。
  // 開著的 Modal 都是使用者操作後才出現, 不會在 server 端渲染, 所以可以直接用 document。
  return createPortal(
    <div
      className={cls(styles.overlay, fullScreen && styles.overlayFull)}
      role="presentation"
      onMouseDown={() => onOpenChange?.(false)}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        className={cls(styles.modal, fullScreen && styles.modalFull)}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width: width ? `min(100%, ${width}px)` : undefined }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div className={styles.modalHeading}>
            <h2 className={styles.modalTitle}>{title}</h2>
            {subtitle && <p className={styles.modalSubtitle}>{subtitle}</p>}
          </div>
          <button type="button" className={styles.modalClose} aria-label={t("close")} onClick={() => onOpenChange?.(false)}>
            <X size={ICON_SIZE.sm} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.modalBody}>{children}</div>
      </section>
    </div>,
    document.body,
  )
}

type FormDialogProps = {
  title: string
  subtitle?: string
  /** 見 `Modal` 的 `fullScreen`。手機上的取消改由左上角的關閉負責, 底部只留送出。 */
  fullScreen?: boolean
  open: boolean
  isPending: boolean
  submitText: string
  pendingText?: string
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  children: ReactNode
}

export function FormDialog({
  title,
  subtitle,
  fullScreen = false,
  open,
  isPending,
  submitText,
  pendingText,
  onClose,
  onSubmit,
  children,
}: FormDialogProps) {
  const t = useT(uiMessages)
  return (
    <Modal
      title={title} subtitle={subtitle} open={open} fullScreen={fullScreen}
      onOpenChange={(next) => { if (!next) onClose() }}
    >
      <form className={styles.dialogForm} onSubmit={onSubmit}>
        {children}
        <div className={styles.dialogFormActions}>
          <span className={styles.dialogFormCancel}>
            <Button variant="outlined" disabled={isPending} onClick={onClose}>{t("cancel")}</Button>
          </span>
          <Button type="submit" disabled={isPending}>{isPending ? pendingText ?? t("pending") : submitText}</Button>
        </div>
      </form>
    </Modal>
  )
}
