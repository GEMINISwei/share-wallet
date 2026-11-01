"use client"

import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  ActionMenu, Button, Container, ErrorState, ICON_SIZE, type MenuItem, Notify, PageHeader,
  StatusBadge, useActionSubmit, useNotify,
} from "@/shared/ui"
import type { ApiResponse } from "@/shared/api/contract"
import { useT } from "@/shared/i18n/context"
import { deleteWalletGroup, moveWalletGroup, setWalletVisibility } from "../actions"
import { type GroupSection, groupMenuItems, moveTargets, walletSettingsSections } from "../groups"
import { walletsMessages } from "../i18n"
import type { WalletGroupInfo, WalletInfo } from "../types"
import ConfirmDialog from "./ConfirmDialog"
import GroupDialog from "./GroupDialog"
import MoveWalletDialog from "./MoveWalletDialog"
import { useGroupLabel } from "./useGroupLabel"
import styles from "./wallets.module.css"

type WalletGroupsViewProps = {
  groups: WalletGroupInfo[]
  wallets: WalletInfo[]
  errorMessage: string
}

/** 改名時是那個群組, 新增時是 null。 */
type Editing = { group: WalletGroupInfo | null } | null

/**
 * 錢包設定: 一般錢包的群組 (新增、改名、刪除、排序) 與每個錢包放在哪、要不要顯示;
 * 旅遊錢包不分群組, 只有要不要顯示。
 */
export default function WalletGroupsView(
  { groups, wallets, errorMessage }: WalletGroupsViewProps,
) {
  const t = useT(walletsMessages)
  const router = useRouter()
  const [editing, setEditing] = useState<Editing>(null)
  const [deleting, setDeleting] = useState<WalletGroupInfo | null>(null)
  const [moving, setMoving] = useState<WalletInfo | null>(null)
  const { isPending, submit } = useActionSubmit()
  const { notify, notifyError, notifySuccess, closeNotify } = useNotify()
  const sections = walletSettingsSections(groups, wallets)
  const groupLabel = useGroupLabel()

  function done(message: string) {
    setEditing(null)
    setDeleting(null)
    setMoving(null)
    notifySuccess(message)
    router.refresh()
  }

  function run(action: () => Promise<ApiResponse>, message: string, errorFallback: string) {
    submit(action, {
      onSuccess: () => done(message),
      onError: (error) => { setDeleting(null); notifyError(error) },
      errorFallback,
    })
  }

  const actions: GroupActions = {
    move: (group, direction) => run(
      () => moveWalletGroup(group.id, direction), t("groupMoved"), t("groupFailed"),
    ),
    rename: (group) => setEditing({ group }),
    remove: setDeleting,
    moveWallet: setMoving,
    toggleWallet: (wallet) => run(
      () => setWalletVisibility(wallet.id, !wallet.is_hidden),
      wallet.is_hidden ? t("walletShown") : t("walletHidden"), t("placementFailed"),
    ),
    canMoveWallet: (wallet) => moveTargets(groups, wallet).length > 0,
  }

  // 刪除後錢包移去的地方, 寫進確認訊息裡。
  const fallback = groups.find((g) => g.is_default)

  return (
    <Container size="lg" padded>
      <PageHeader title={t("walletSettingsTitle")} />
      <div className={styles.content}>
        <p className={styles.hint}>{t("walletSettingsHint")}</p>
        {errorMessage && <ErrorState>{errorMessage}</ErrorState>}
        {!errorMessage && (
          <>
            <GeneralSection
              sections={sections.general} actions={actions}
              onAdd={() => setEditing({ group: null })}
            />
            <TravelSection wallets={sections.travel} actions={actions} />
          </>
        )}
      </div>

      <GroupDialog
        key={editing ? `group-${editing.group?.id ?? "new"}` : "group-closed"}
        group={editing?.group ?? null} open={editing !== null}
        onClose={() => setEditing(null)} onSuccess={done} onError={notifyError}
      />
      <MoveWalletDialog
        key={`move-${moving?.id ?? "closed"}`} wallet={moving}
        targets={moving ? moveTargets(groups, moving) : []} groupLabel={groupLabel}
        onClose={() => setMoving(null)} onSuccess={done} onError={notifyError}
      />
      <ConfirmDialog
        open={deleting !== null} isPending={isPending}
        message={deleting && fallback
          ? t("deleteGroupConfirm", { name: groupLabel(deleting), fallback: groupLabel(fallback) })
          : ""}
        onConfirm={() => deleting && run(
          () => deleteWalletGroup(deleting.id), t("groupDeleted"), t("groupFailed"),
        )}
        onClose={() => setDeleting(null)}
      />
      <Notify {...notify} onOpenChange={(open) => { if (!open) closeNotify() }} />
    </Container>
  )
}

type GroupActions = {
  move: (group: WalletGroupInfo, direction: "up" | "down") => void
  rename: (group: WalletGroupInfo) => void
  remove: (group: WalletGroupInfo) => void
  moveWallet: (wallet: WalletInfo) => void
  toggleWallet: (wallet: WalletInfo) => void
  canMoveWallet: (wallet: WalletInfo) => boolean
}

type GeneralSectionProps = { sections: GroupSection[]; actions: GroupActions; onAdd: () => void }

function GeneralSection({ sections, actions, onAdd }: GeneralSectionProps) {
  const t = useT(walletsMessages)
  const groupLabel = useGroupLabel()
  const title = t("generalGroups")
  return (
    <section aria-label={title} className={styles.content}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <Button variant="outlined" icon={<Plus size={ICON_SIZE.sm} />} onClick={onAdd}>
          {t("addGroup")}
        </Button>
      </div>
      {sections.map((section, index) => (
        <GroupBlock
          key={section.group.id} section={section} index={index} count={sections.length}
          label={groupLabel(section.group)} actions={actions}
        />
      ))}
    </section>
  )
}

type GroupBlockProps = {
  section: GroupSection
  index: number
  count: number
  label: string
  actions: GroupActions
}

function GroupBlock({ section, index, count, label, actions }: GroupBlockProps) {
  const t = useT(walletsMessages)
  const { group, wallets } = section
  const menu: Record<ReturnType<typeof groupMenuItems>[number], MenuItem> = {
    moveUp: { label: t("moveGroupUp"), onClick: () => actions.move(group, "up") },
    moveDown: { label: t("moveGroupDown"), onClick: () => actions.move(group, "down") },
    rename: { label: t("renameGroup"), onClick: () => actions.rename(group) },
    delete: { label: t("deleteGroup"), color: "error", onClick: () => actions.remove(group) },
  }

  return (
    <section aria-label={label} className={styles.groupBlock}>
      <div className={styles.groupHeader}>
        <span className={`${styles.rowMain} ${styles.rowGrow}`}>
          <h3 className={styles.rowTitle}>{label}</h3>
          <span className={styles.rowMeta}>{t("groupCount", { count: group.wallet_count })}</span>
        </span>
        <ActionMenu items={groupMenuItems(group, index, count).map((key) => menu[key])} />
      </div>
      <WalletRows wallets={wallets} actions={actions} />
    </section>
  )
}

/** 旅遊錢包不分群組: 一張卡片列出全部 (含不顯示與已結帳的), 只能切換顯示。 */
function TravelSection({ wallets, actions }: { wallets: WalletInfo[]; actions: GroupActions }) {
  const t = useT(walletsMessages)
  const title = t("travelWallets")
  return (
    <section aria-label={title} className={styles.content}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{title}</h2>
      </div>
      <div className={styles.groupBlock}>
        <WalletRows wallets={wallets} actions={actions} />
      </div>
    </section>
  )
}

function WalletRows({ wallets, actions }: { wallets: WalletInfo[]; actions: GroupActions }) {
  const t = useT(walletsMessages)
  if (wallets.length === 0) {
    return <p className={`${styles.hint} ${styles.groupEmpty}`}>{t("noWalletsInGroup")}</p>
  }
  return (
    <ul className={styles.list}>
      {wallets.map((wallet) => (
        <li key={wallet.id} className={styles.row}>
          <span className={`${styles.rowTitle} ${wallet.is_hidden ? styles.rowTitleMuted : ""}`}>
            {wallet.name}
          </span>
          <span className={styles.rowEnd}>
            {wallet.is_hidden && <StatusBadge label={t("hiddenBadge")} variant="muted" />}
            <ActionMenu
              items={[
                actions.canMoveWallet(wallet)
                  && { label: t("moveToGroup"), onClick: () => actions.moveWallet(wallet) },
                {
                  label: wallet.is_hidden ? t("showWallet") : t("hideWallet"),
                  onClick: () => actions.toggleWallet(wallet),
                },
              ]}
            />
          </span>
        </li>
      ))}
    </ul>
  )
}
