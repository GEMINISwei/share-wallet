"use client"

import { useRouter } from "next/navigation"
import {
  MessagePage, MessagePageButton, MessagePageLink, Notify, useActionSubmit, useNotify,
} from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { acceptInvite } from "../actions"
import { walletsMessages } from "../i18n"
import { WALLETS_PATH } from "../manifest"
import { walletPath } from "../paths"
import type { InvitePreview } from "../types"

type InviteViewProps = {
  token: string
  preview: InvitePreview
  summary: string
}

/** 單張卡片, 跟登入、註冊頁一樣沒有外殼: 三步看起來是同一個流程。 */
export default function InviteView({ token, preview, summary }: InviteViewProps) {
  const t = useT(walletsMessages)
  const router = useRouter()
  const { isPending, submit } = useActionSubmit()
  const { notify, notifyError, closeNotify } = useNotify()

  if (preview.is_member) {
    return (
      <MessagePage title={t("alreadyMemberTitle", { name: preview.name })} description={summary}>
        <MessagePageLink href={walletPath(preview.wallet_id)}>{t("goToWallet")}</MessagePageLink>
      </MessagePage>
    )
  }

  function join() {
    if (isPending) return
    submit(() => acceptInvite(token), {
      onSuccess: () => router.push(walletPath(preview.wallet_id)),
      // 確認之前連結剛好過期或被撤銷: 重新整理, 由頁面換成「連結無效」。
      onError: (message) => {
        notifyError(message)
        router.refresh()
      },
      errorFallback: t("joinFailed"),
    })
  }

  return (
    <>
      <MessagePage title={t("joinTitle", { name: preview.name })} description={summary}>
        <MessagePageButton onClick={join}>
          {isPending ? t("joinPending") : t("joinConfirm")}
        </MessagePageButton>
        <MessagePageLink href={WALLETS_PATH}>{t("cancel")}</MessagePageLink>
      </MessagePage>
      <Notify {...notify} onOpenChange={(open) => { if (!open) closeNotify() }} />
    </>
  )
}
