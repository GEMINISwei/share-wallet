"use client"

import { useEffect, useRef, useState } from "react"
import { getApiListData } from "@/shared/api/response"
import { ChoiceGroup, SelectInput } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { loadCategories, loadMyWallets } from "../actions"
import { entryCategoryOptions, NO_SYNC, transferTargets } from "../capabilities"
import { walletsMessages } from "../i18n"
import type { CategoryInfo, ExpenseSyncValues, TransferTarget } from "../types"
import styles from "./wallets.module.css"

type Loaded<T> = { status: "loading" } | { status: "failed" } | { status: "ready"; items: T[] }

type ExpenseSyncFieldsProps = {
  /** 這個旅遊錢包; 選單只列一般錢包, 本來就不會列到它。 */
  walletId: string
  value: ExpenseSyncValues
  error?: string
  disabled: boolean
  onChange: (value: ExpenseSyncValues) => void
}

/**
 * 新增旅遊帳時同步到自己的一般錢包: 先選錢包 (預設不同步), 再選那個錢包的支出分類
 * (見 docs/features/travel-wallet.md〈同步到一般錢包〉)。選單同轉帳的對方錢包, 不列設為不顯示的。
 */
export default function ExpenseSyncFields({
  walletId, value, error, disabled, onChange,
}: ExpenseSyncFieldsProps) {
  const t = useT(walletsMessages)
  const [targets, setTargets] = useState<Loaded<TransferTarget>>({ status: "loading" })
  const [categories, setCategories] = useState<Loaded<CategoryInfo>>({ status: "ready", items: [] })
  // 連續換錢包時, 只採用最後一次選的那個錢包的分類。
  const requested = useRef("")

  useEffect(() => {
    let cancelled = false
    void loadMyWallets().then((res) => {
      if (cancelled) return
      setTargets(res.status === "success"
        ? { status: "ready", items: transferTargets(getApiListData(res), walletId) }
        : { status: "failed" })
    })
    return () => { cancelled = true }
  }, [walletId])

  function chooseWallet(id: string) {
    requested.current = id
    onChange({ ...NO_SYNC, wallet_id: id })
    if (!id) {
      setCategories({ status: "ready", items: [] })
      return
    }
    setCategories({ status: "loading" })
    void loadCategories(id).then((res) => {
      if (requested.current !== id) return
      setCategories(res.status === "success"
        ? { status: "ready", items: getApiListData(res) }
        : { status: "failed" })
    })
  }

  if (targets.status === "loading") return null
  if (targets.status === "failed") return <p className={styles.hint}>{t("syncLoadFailed")}</p>
  // 沒有可以同步的一般錢包時整塊不出現, 不放一個只有「不同步」的選單。
  if (targets.items.length === 0) return null

  return (
    <>
      <SelectInput
        label={t("syncToGeneral")} value={value.wallet_id} disabled={disabled}
        options={[
          { value: "", label: t("noSync") },
          ...targets.items.map((target) => ({ value: target.id, label: target.name })),
        ]}
        onChange={chooseWallet}
      />
      {value.wallet_id && categories.status === "loading" && (
        <p className={styles.hint}>{t("loadingMore")}</p>
      )}
      {value.wallet_id && categories.status === "failed" && (
        <p className={styles.hint}>{t("syncLoadFailed")}</p>
      )}
      {value.wallet_id && categories.status === "ready" && (
        <>
          <ChoiceGroup
            label={t("category")} value={value.category_id} required disabled={disabled}
            variant="chips" error={error}
            options={entryCategoryOptions(categories.items, "expense", null)
              .map((option) => ({ value: option.id, label: option.name }))}
            onChange={(categoryId) => onChange({ ...value, category_id: categoryId })}
          />
          <p className={styles.hint}>{t("syncHint")}</p>
        </>
      )}
    </>
  )
}
