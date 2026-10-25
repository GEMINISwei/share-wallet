"use client"

import { useT } from "@/shared/i18n/context"
import { walletsMessages } from "../i18n"
import type { WalletKind } from "../types"
import styles from "./wallets.module.css"

type KindOptionsProps = {
  value: WalletKind
  disabled: boolean
  onChange: (kind: WalletKind) => void
}

/** 建立錢包時選類型 (使用者區與後台共用)。類型建立後不能改, 所以設定頁沒有這一塊。 */
export default function KindOptions({ value, disabled, onChange }: KindOptionsProps) {
  const t = useT(walletsMessages)
  const kinds: { value: WalletKind; title: string; desc: string }[] = [
    { value: "general", title: t("kindGeneral"), desc: t("kindGeneralDesc") },
    { value: "travel", title: t("kindTravel"), desc: t("kindTravelDesc") },
  ]

  return (
    <div className={styles.kindOptions} role="radiogroup" aria-label={t("kind")}>
      {kinds.map((kind) => {
        const selected = value === kind.value
        return (
          <button
            key={kind.value} type="button" role="radio" aria-checked={selected}
            className={[styles.kindOption, selected && styles.kindOptionSelected].filter(Boolean).join(" ")}
            disabled={disabled} onClick={() => onChange(kind.value)}
          >
            <span className={styles.kindOptionTitle}>{kind.title}</span>
            <span className={styles.kindOptionDesc}>{kind.desc}</span>
          </button>
        )
      })}
    </div>
  )
}
