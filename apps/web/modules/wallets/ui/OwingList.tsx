"use client"

import { Button, Modal } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { owingTargets } from "../capabilities"
import { walletsMessages } from "../i18n"
import type { AdvanceTargetInfo } from "../types"
import Amount from "./Amount"
import styles from "./wallets.module.css"

/** 代墊未還的清單, 只是顯示: 還款一律從代墊的詳情操作 (見 docs/features.md〈代墊與還款〉)。 */
function OwingRows({ owing }: { owing: AdvanceTargetInfo[] }) {
  return (
    <ul className={`${styles.fieldList} ${styles.owingList}`}>
      {owing.map((target) => (
        <li key={target.name} className={styles.fieldRow}>
          <span>{target.name}</span>
          <Amount value={target.outstanding} />
        </li>
      ))}
    </ul>
  )
}

/** 桌機錢包頁上的代墊未還; 手機收進選單 (`OwingDialog`)。都還清時整塊不出現。 */
export default function OwingList({ targets }: { targets: AdvanceTargetInfo[] }) {
  const t = useT(walletsMessages)
  const owing = owingTargets(targets)
  if (owing.length === 0) return null
  return (
    <section className={styles.desktopOnly}>
      <h2 className={styles.sectionTitle}>{t("owingList")}</h2>
      <OwingRows owing={owing} />
    </section>
  )
}

type OwingDialogProps = { targets: AdvanceTargetInfo[]; open: boolean; onClose: () => void }

/** 手機從 ⋮ 選單打開的代墊未還。都還清時選單沒有這一項 (`walletMenuItems`)。 */
export function OwingDialog({ targets, open, onClose }: OwingDialogProps) {
  const t = useT(walletsMessages)
  return (
    <Modal title={t("owingList")} open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <OwingRows owing={owingTargets(targets)} />
      <div className={styles.dialogActions}>
        <Button variant="outlined" onClick={onClose}>{t("close")}</Button>
      </div>
    </Modal>
  )
}
