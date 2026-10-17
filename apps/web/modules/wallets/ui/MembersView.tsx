"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { ActionMenu, ErrorState, Notify, StatusBadge, useActionSubmit, useNotify } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { removeMember, updateMemberRole } from "../actions"
import { isLastAdmin, memberActions } from "../capabilities"
import { walletsMessages } from "../i18n"
import { type WalletArea, walletPath, walletsListPath } from "../paths"
import type { MemberInfo, MemberRole, WalletInfo } from "../types"
import ConfirmDialog from "./ConfirmDialog"
import WalletShell from "./WalletShell"
import styles from "./wallets.module.css"

type MembersViewProps = {
  wallet: WalletInfo
  area: WalletArea
  members: MemberInfo[]
  currentUserId: string
  errorMessage: string
}

/** 等使用者確認的移除或離開。 */
type PendingRemoval = { member: MemberInfo; leaving: boolean } | null

export default function MembersView({
  wallet, area, members, currentUserId, errorMessage,
}: MembersViewProps) {
  const t = useT(walletsMessages)
  const router = useRouter()
  const [removal, setRemoval] = useState<PendingRemoval>(null)
  const { isPending, submit } = useActionSubmit()
  const { notify, notifyError, notifySuccess, closeNotify } = useNotify()
  const viewer = { userId: currentUserId, canManage: wallet.can_manage }
  const self = members.find((member) => member.user_id === currentUserId)

  function changeRole(member: MemberInfo, role: MemberRole) {
    submit(() => updateMemberRole(wallet.id, member.user_id, role), {
      onSuccess: () => {
        notifySuccess(t("memberUpdated"))
        router.refresh()
      },
      onError: notifyError,
      errorFallback: t("memberUpdateFailed"),
    })
  }

  function confirmRemoval() {
    if (!removal) return
    const { member, leaving } = removal
    submit(() => removeMember(wallet.id, member.user_id), {
      onSuccess: () => {
        setRemoval(null)
        // 離開之後這個錢包就打不開了, 回到列表。
        if (leaving) {
          router.push(walletsListPath(area))
          return
        }
        notifySuccess(t("memberRemoved"))
        router.refresh()
      },
      onError: (message) => {
        setRemoval(null)
        notifyError(message)
      },
      errorFallback: t("memberUpdateFailed"),
    })
  }

  function menuItems(member: MemberInfo) {
    const actions = memberActions(member, members, viewer)
    return [
      actions.promote && { label: t("promote"), onClick: () => changeRole(member, "admin") },
      actions.demote && { label: t("demote"), onClick: () => changeRole(member, "member") },
      actions.remove && {
        label: t("remove"), color: "error" as const,
        onClick: () => setRemoval({ member, leaving: false }),
      },
      actions.leave && {
        label: t("leave"), color: "error" as const,
        onClick: () => setRemoval({ member, leaving: true }),
      },
    ]
  }

  const removalMessage = removal?.leaving
    ? t("leaveConfirm", { name: wallet.name })
    : t("removeConfirm", { nickname: removal?.member.nickname ?? "" })

  return (
    <WalletShell
      title={t("members")} subtitle={wallet.name}
      backHref={walletPath(wallet.id, area)} backLabel={t("backToWallet")}
    >
      {errorMessage && <ErrorState>{errorMessage}</ErrorState>}
      <ul className={styles.list}>
        {members.map((member) => (
          <li key={member.user_id} className={styles.row}>
            <span className={styles.rowMain}>
              <span className={styles.rowTitle}>
                {member.nickname}{member.user_id === currentUserId && t("you")}
              </span>
            </span>
            <span className={styles.rowEnd}>
              <StatusBadge
                label={member.role === "admin" ? t("roleAdmin") : t("roleMember")}
                variant={member.role === "admin" ? "success" : "muted"}
              />
              {!isPending && <ActionMenu items={menuItems(member)} />}
            </span>
          </li>
        ))}
      </ul>
      {self && isLastAdmin(self, members) && <p className={styles.hint}>{t("lastAdminHint")}</p>}

      <ConfirmDialog
        open={removal !== null} message={removalMessage} isPending={isPending}
        onConfirm={confirmRemoval} onClose={() => setRemoval(null)}
      />
      <Notify {...notify} onOpenChange={(open) => { if (!open) closeNotify() }} />
    </WalletShell>
  )
}
