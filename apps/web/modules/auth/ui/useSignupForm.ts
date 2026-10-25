"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { getApiResponseErrorMessage } from "@/shared/api/error"
import { createActionFormData } from "@/shared/api/action-form-data"
import { useLocale, useT } from "@/shared/i18n/context"
import { useNotify } from "@/shared/ui"
import { signupUser } from "../actions"
import { authDestinations } from "../destinations"
import { authMessages } from "../i18n"
import { validateSignupValues } from "../validation"
import type { SignupFormErrors, SignupFormValues } from "../types"

const initialValues: SignupFormValues = {
  username: "",
  nickname: "",
  password: "",
}

/** `invite` 是已驗證過的邀請 token (見 `../destinations`)。 */
export function useSignupForm(invite?: string) {
  const locale = useLocale()
  const t = useT(authMessages)
  const router = useRouter()
  const [values, setValues] = useState<SignupFormValues>(initialValues)
  const [errors, setErrors] = useState<SignupFormErrors>({})
  const [isSubmit, setIsSubmit] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isPending, startTransition] = useTransition()
  // 與登入流程共用同一個通知機制。
  const { notify, notifyError, closeNotify } = useNotify()
  const destinations = authDestinations(invite)

  return {
    values,
    errors,
    isSubmit,
    isPending,
    showPassword,
    notifyState: notify,
    closeNotify,
    changeValue: (name: keyof SignupFormValues, value: string) => {
      const nextValues = { ...values, [name]: value }
      setValues(nextValues)
      if (isSubmit) setErrors(validateSignupValues(nextValues, locale))
    },
    togglePassword: () => setShowPassword((prev) => !prev),
    goLogin: () => router.push(destinations.login),
    submit: () => {
      const nextErrors = validateSignupValues(values, locale)
      setErrors(nextErrors)
      setIsSubmit(true)

      if (Object.values(nextErrors).some(Boolean)) return

      startTransition(async () => {
        const res = await signupUser(createActionFormData(values))

        // 後端已經簽好 token 寫進 cookie, 直接進首頁 (帶著邀請時是確認頁)。
        if (res.status === "success") {
          router.push(destinations.afterAuth)
          return
        }

        notifyError(getApiResponseErrorMessage(res, t("signupFailed")))
      })
    },
  }
}
