"use client"

import { type FormEvent, useState } from "react"
import { FormDialog, SelectInput, useActionSubmit } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { setWalletGroup } from "../actions"
import { walletsMessages } from "../i18n"
import type { WalletGroupInfo, WalletInfo } from "../types"

type MoveWalletDialogProps = {
  wallet: WalletInfo | null
  /** 可以移去的群組 (`moveTargets`), 依自己排的順序。 */
  targets: WalletGroupInfo[]
  groupLabel: (group: WalletGroupInfo) => string
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (message: string) => void
}

export default function MoveWalletDialog({
  wallet, targets, groupLabel, onClose, onSuccess, onError,
}: MoveWalletDialogProps) {
  const t = useT(walletsMessages)
  const [groupId, setGroupId] = useState(targets[0]?.id ?? "")
  const { isPending, submit } = useActionSubmit()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const target = targets.find((group) => group.id === groupId)
    if (!wallet || !target) return
    submit(() => setWalletGroup(wallet.id, target.id), {
      onSuccess: () => onSuccess(t("walletMoved", { name: groupLabel(target) })),
      onError,
      errorFallback: t("placementFailed"),
    })
  }

  return (
    <FormDialog
      title={t("moveToGroup")} subtitle={wallet?.name} open={wallet !== null} isPending={isPending}
      submitText={t("save")} pendingText={t("saving")} onClose={onClose} onSubmit={handleSubmit}
    >
      <SelectInput
        label={t("groupField")} value={groupId} disabled={isPending}
        options={targets.map((group) => ({ value: group.id, label: groupLabel(group) }))}
        onChange={setGroupId}
      />
    </FormDialog>
  )
}
