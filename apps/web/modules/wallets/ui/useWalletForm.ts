"use client"

import { useState } from "react"
import { useLocale } from "@/shared/i18n/context"
import { hasErrors, validateWalletForm } from "../validation"
import type { WalletFormErrors, WalletFormValues } from "../types"

/** 錢包表單的值與錯誤。改一個欄位就清掉那個欄位的錯誤, 送出前整份重新驗證。 */
export function useWalletForm(initial: WalletFormValues) {
  const locale = useLocale()
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<WalletFormErrors>({})

  function change(field: keyof WalletFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  /** 驗證通過回傳 true。 */
  function validate() {
    const next = validateWalletForm(values, locale)
    setErrors(next)
    return !hasErrors(next)
  }

  function reset() {
    setValues(initial)
    setErrors({})
  }

  return { values, errors, change, validate, reset }
}
