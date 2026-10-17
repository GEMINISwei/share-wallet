"use client"

import { Button, Modal } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { walletsMessages } from "../i18n"
import styles from "./wallets.module.css"

type ConfirmDialogProps = {
  open: boolean
  message: string
  isPending: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function ConfirmDialog({
  open, message, isPending, onConfirm, onClose,
}: ConfirmDialogProps) {
  const t = useT(walletsMessages)
  return (
    <Modal title={t("confirmTitle")} open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <p className={styles.hint}>{message}</p>
      <div className={styles.dialogActions}>
        <Button variant="outlined" disabled={isPending} onClick={onClose}>{t("cancel")}</Button>
        <Button disabled={isPending} onClick={onConfirm}>{t("confirm")}</Button>
      </div>
    </Modal>
  )
}
