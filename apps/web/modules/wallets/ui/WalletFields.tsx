"use client"

import { TextInput } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { walletsMessages } from "../i18n"
import type { WalletFormErrors, WalletFormValues } from "../types"
import styles from "./wallets.module.css"

type WalletFieldsProps = {
  values: WalletFormValues
  errors: WalletFormErrors
  disabled: boolean
  /** 只有建立時能填初始餘額; 之後的餘額由記帳的「調整餘額」處理。 */
  showInitialBalance: boolean
  onChange: (field: keyof WalletFormValues, value: string) => void
}

/** 建立錢包與詳細設定共用的欄位。類型的選擇只在建立時出現, 不在這裡。 */
export default function WalletFields({
  values, errors, disabled, showInitialBalance, onChange,
}: WalletFieldsProps) {
  const t = useT(walletsMessages)
  return (
    <>
      <TextInput
        label={t("name")} value={values.name} error={errors.name} required disabled={disabled}
        onChange={(value) => onChange("name", value)}
      />
      <p className={styles.hint}>{t("nameHint")}</p>
      {values.kind === "general" && showInitialBalance && (
        <TextInput
          label={t("initialBalance")} value={values.initial_balance} placeholder="0"
          error={errors.initial_balance} disabled={disabled}
          onChange={(value) => onChange("initial_balance", value)}
        />
      )}
      {values.kind === "travel" && (
        <>
          <TextInput
            label={t("destination")} value={values.destination} error={errors.destination}
            required disabled={disabled} onChange={(value) => onChange("destination", value)}
          />
          <div className={styles.dateFields}>
            <TextInput
              label={t("startDate")} type="date" value={values.start_date}
              error={errors.start_date} required disabled={disabled}
              onChange={(value) => onChange("start_date", value)}
            />
            <TextInput
              label={t("endDate")} type="date" value={values.end_date}
              error={errors.end_date} required disabled={disabled}
              onChange={(value) => onChange("end_date", value)}
            />
          </div>
        </>
      )}
    </>
  )
}
