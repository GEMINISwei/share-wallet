"use client"

import { Plus, X } from "lucide-react"
import { Button, ICON_SIZE, SelectInput, TextInput } from "@/shared/ui"
import { useLocale, useT } from "@/shared/i18n/context"
import { newShareRow, shareUserOptions, splitEqually } from "../capabilities"
import { formatAmount } from "../format"
import { walletsMessages } from "../i18n"
import type { ExpenseFormValues, MemberInfo, ShareRowValues } from "../types"
import { parsePositiveAmount, shareRemainder } from "../validation"
import styles from "./wallets.module.css"

type SharesProps<T> = {
  values: ExpenseFormValues
  /** 加入錢包的順序。 */
  members: MemberInfo[]
  disabled: boolean
  error?: string
  onChange: (value: T) => void
}

function FieldError({ error }: { error?: string }) {
  if (!error) return null
  return <span className={styles.fieldError} role="alert">{error}</span>
}

/** 均分: 勾選分攤對象, 旁邊預覽每人分到多少 (零頭的規則同後端)。 */
export function EqualShares({ values, members, disabled, error, onChange }: SharesProps<string[]>) {
  const t = useT(walletsMessages)
  const locale = useLocale()
  const chosen = values.participant_ids
  const memberIds = members.map((member) => member.user_id)
  const amount = parsePositiveAmount(values.amount)
  const preview = new Map(
    splitEqually(amount ?? 0, values.payer_id, chosen, memberIds)
      .map((share) => [share.user_id, share.amount]),
  )

  function toggle(userId: string) {
    onChange(chosen.includes(userId) ? chosen.filter((id) => id !== userId) : [...chosen, userId])
  }

  return (
    <fieldset className={styles.shareField}>
      <legend className={styles.shareLegend}>{t("participants")}</legend>
      <ul className={styles.shareList}>
        {members.map((member) => (
          <li key={member.user_id}>
            <label className={styles.shareCheck}>
              <input
                type="checkbox" checked={chosen.includes(member.user_id)} disabled={disabled}
                onChange={() => toggle(member.user_id)}
              />
              <span className={styles.shareName}>{member.nickname}</span>
              {amount !== null && preview.has(member.user_id) && (
                <span className={styles.amount}>
                  {formatAmount(preview.get(member.user_id) ?? 0, locale)}
                </span>
              )}
            </label>
          </li>
        ))}
      </ul>
      <FieldError error={error} />
    </fieldset>
  )
}

function RemainderHint({ values }: { values: ExpenseFormValues }) {
  const t = useT(walletsMessages)
  const locale = useLocale()
  const remainder = shareRemainder(values.amount, values.shares)
  if (remainder === null || values.shares.length === 0) return null
  const text = remainder === 0
    ? t("shareBalanced")
    : t(remainder > 0 ? "shareRemaining" : "shareOver", {
      amount: formatAmount(Math.abs(remainder), locale),
    })
  return <p className={styles.hint}>{text}</p>
}

/**
 * 指定金額: 一張表, 按「新增」加一列, 選人、填金額 (見 docs/features/travel-wallet.md〈分攤〉)。
 * 每一列能選的人不含其他列已經選的; 全部的人都在表上時「新增」就停用。
 */
export function CustomShares(
  { values, members, disabled, error, onChange }: SharesProps<ShareRowValues[]>,
) {
  const t = useT(walletsMessages)
  const rows = values.shares

  function update(key: string, patch: Partial<ShareRowValues>) {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  return (
    <fieldset className={styles.shareField}>
      <legend className={styles.shareLegend}>{t("shares")}</legend>
      {rows.map((row) => (
        <div key={row.key} className={styles.shareRow}>
          <SelectInput
            ariaLabel={t("shareUser")} value={row.user_id} disabled={disabled}
            options={[
              { value: "", label: t("payerPlaceholder") },
              ...shareUserOptions(members, rows, row.key)
                .map((member) => ({ value: member.user_id, label: member.nickname })),
            ]}
            onChange={(value) => update(row.key, { user_id: value })}
          />
          <TextInput
            ariaLabel={t("shareAmount")} value={row.amount} disabled={disabled}
            onChange={(value) => update(row.key, { amount: value })}
          />
          <button
            type="button" className={styles.iconButton} aria-label={t("removeShare")}
            disabled={disabled}
            onClick={() => onChange(rows.filter((item) => item.key !== row.key))}
          >
            <X size={ICON_SIZE.sm} aria-hidden="true" />
          </button>
        </div>
      ))}
      <RemainderHint values={values} />
      <FieldError error={error} />
      <div>
        <Button
          variant="outlined" icon={<Plus size={ICON_SIZE.sm} />}
          disabled={disabled || rows.length >= members.length}
          onClick={() => onChange([...rows, newShareRow()])}
        >
          {t("addShare")}
        </Button>
      </div>
    </fieldset>
  )
}
