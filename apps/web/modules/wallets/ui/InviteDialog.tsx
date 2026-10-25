"use client"

import { useRouter } from "next/navigation"
import { Button, ErrorState, Modal, Notify, TextInput, useActionSubmit, useNotify } from "@/shared/ui"
import type { ApiResponse } from "@/shared/api/contract"
import { useT } from "@/shared/i18n/context"
import { createInvite, revokeInvite } from "../actions"
import { walletsMessages } from "../i18n"
import { invitePath } from "../invite-link"
import type { InviteInfo } from "../types"
import LocalDate from "./LocalDate"
import styles from "./wallets.module.css"

type InviteDialogProps = {
  open: boolean
  walletId: string
  invite: InviteInfo | null
  loadError: string
  onClose: () => void
}

/** 產生、複製、重新產生、撤銷邀請連結 (見 docs/features.md〈邀請連結〉)。 */
export default function InviteDialog({
  open, walletId, invite, loadError, onClose,
}: InviteDialogProps) {
  const t = useT(walletsMessages)
  const router = useRouter()
  const { isPending, submit } = useActionSubmit()
  const { notify, notifyError, notifySuccess, closeNotify } = useNotify()
  // 對話框只在使用者點開之後才渲染內容, 那時一定在瀏覽器裡。
  const link = invite && typeof window !== "undefined"
    ? `${window.location.origin}${invitePath(invite.token)}`
    : ""

  function run(action: () => Promise<ApiResponse>, success?: string) {
    submit(action, {
      onSuccess: () => {
        if (success) notifySuccess(success)
        router.refresh()
      },
      onError: notifyError,
      errorFallback: t("inviteFailed"),
    })
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      notifySuccess(t("inviteCopied"))
    } catch {
      // 非 https (例如用區網 IP 開) 時瀏覽器不給剪貼簿, 連結就在欄位裡, 讓人自己選。
      notifyError(t("inviteCopyFailed"))
    }
  }

  return (
    <Modal title={t("inviteTitle")} open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <div className={styles.dialogBody}>
        <p className={styles.hint}>{t("inviteIntro")}</p>
        {loadError && <ErrorState>{loadError}</ErrorState>}
        {invite ? (
          <>
            <TextInput label={t("inviteLink")} value={link} readOnly />
            <p className={styles.hint}>
              {t("inviteExpires")} <LocalDate iso={invite.expires_at} withTime />
            </p>
            <p className={styles.hint}>{t("inviteReplaceHint")}</p>
            <div className={styles.dialogActions}>
              <Button
                variant="outlined" disabled={isPending}
                onClick={() => run(() => revokeInvite(walletId), t("inviteRevoked"))}
              >
                {t("inviteRevoke")}
              </Button>
              <Button
                variant="outlined" disabled={isPending}
                onClick={() => run(() => createInvite(walletId))}
              >
                {t("inviteRegenerate")}
              </Button>
              <Button disabled={isPending} onClick={copy}>{t("inviteCopy")}</Button>
            </div>
          </>
        ) : (
          <div className={styles.dialogActions}>
            <Button disabled={isPending} onClick={() => run(() => createInvite(walletId))}>
              {t("inviteCreate")}
            </Button>
          </div>
        )}
      </div>
      <Notify {...notify} onOpenChange={(next) => { if (!next) closeNotify() }} />
    </Modal>
  )
}
