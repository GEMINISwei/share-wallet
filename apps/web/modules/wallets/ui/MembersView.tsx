"use client"

import { UserPlus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  ActionMenu, Button, ErrorState, ICON_SIZE, Notify, StatusBadge, useActionSubmit, useNotify,
} from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { removeMember, updateMemberRole } from "../actions"
import { isLastAdmin, memberActions } from "../capabilities"
import { walletsMessages } from "../i18n"
import { type WalletArea, walletPath, walletsListPath } from "../paths"
import type { InviteInfo, MemberInfo, MemberRole, WalletInfo } from "../types"
import ConfirmDialog from "./ConfirmDialog"
import InviteDialog from "./InviteDialog"
import WalletShell from "./WalletShell"
import styles from "./wallets.module.css"

type MembersViewProps = {
  wallet: WalletInfo
  area: WalletArea
  members: MemberInfo[]
  currentUserId: string
  errorMessage: string
  /** 目前有效的邀請連結; 不是管理者時一律 null。 */
  invite: InviteInfo | null
  inviteError: string
}

/** 等使用者確認的移除或離開。 */
type PendingRemoval = { member: MemberInfo; leaving: boolean } | null

export default function MembersView({
  wallet, area, members, currentUserId, errorMessage, invite, inviteError,
}: MembersViewProps) {
  const t = useT(walletsMessages)
  const router = useRouter()
  const [removal, setRemoval] = useState<PendingRemoval>(null)
  const [inviting, setInviting] = useState(false)
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

  // 邀請只有管理者能做, 入口只放標題列這一個 (手機收進 ⋮ 選單)。
  const openInvite = () => setInviting(true)
  const inviteIcon = <UserPlus size={ICON_SIZE.sm} />

  return (
    <WalletShell
      title={t("members")} subtitle={wallet.name}
      backHref={walletPath(wallet.id, area)} backLabel={t("backToWallet")}
      actions={wallet.can_manage && (
        <Button icon={inviteIcon} onClick={openInvite}>{t("invite")}</Button>
      )}
      mobileActions={wallet.can_manage
        ? [{ icon: inviteIcon, label: t("invite"), onClick: openInvite }]
        : undefined}
    >
      {errorMessage && <ErrorState>{errorMessage}</ErrorState>}
      <ul className={styles.list}>
        {members.map((member) => (
          <MemberRow
            key={member.user_id} member={member} isSelf={member.user_id === currentUserId}
            menu={isPending ? null : <ActionMenu items={menuItems(member)} />}
          />
        ))}
      </ul>
      {self && isLastAdmin(self, members) && <p className={styles.hint}>{t("lastAdminHint")}</p>}

      {wallet.can_manage && (
        <InviteDialog
          open={inviting} walletId={wallet.id} invite={invite} loadError={inviteError}
          onClose={() => setInviting(false)}
        />
      )}
      <ConfirmDialog
        open={removal !== null} message={removalMessage} isPending={isPending}
        onConfirm={confirmRemoval} onClose={() => setRemoval(null)}
      />
      <Notify {...notify} onOpenChange={(open) => { if (!open) closeNotify() }} />
    </WalletShell>
  )
}

type MemberRowProps = { member: MemberInfo; isSelf: boolean; menu: React.ReactNode }

function MemberRow({ member, isSelf, menu }: MemberRowProps) {
  const t = useT(walletsMessages)
  return (
    <li className={styles.row}>
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{member.nickname}{isSelf && t("you")}</span>
      </span>
      <span className={styles.rowEnd}>
        <StatusBadge
          label={member.role === "admin" ? t("roleAdmin") : t("roleMember")}
          variant={member.role === "admin" ? "success" : "muted"}
        />
        {menu}
      </span>
    </li>
  )
}
