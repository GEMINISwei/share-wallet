"use client"

import { Button, Modal } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { walletsMessages } from "../i18n"
import type { AdminWalletInfo } from "../types"
import styles from "./wallets.module.css"

type WalletAdminsDialogProps = {
  wallet: AdminWalletInfo | null
  onClose: () => void
}

/** 後台列表上點管理者欄位時, 列出這個錢包的所有管理者。 */
export default function WalletAdminsDialog({ wallet, onClose }: WalletAdminsDialogProps) {
  const t = useT(walletsMessages)
  return (
    <Modal
      title={t("adminsTitle", { name: wallet?.name ?? "" })} open={wallet !== null}
      onOpenChange={(open) => { if (!open) onClose() }}
    >
      {wallet && wallet.admins.length === 0 && <p className={styles.hint}>{t("noAdmins")}</p>}
      {wallet && wallet.admins.length > 0 && (
        <ul className={styles.list}>
          {wallet.admins.map((admin) => (
            <li key={admin.user_id} className={styles.row}>
              <span className={styles.rowTitle}>{admin.nickname}</span>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.dialogActions}>
        <Button variant="outlined" onClick={onClose}>{t("close")}</Button>
      </div>
    </Modal>
  )
}
