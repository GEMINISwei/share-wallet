import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ApiResponse } from "@/shared/api/contract"
import { useSignupForm } from "@/modules/auth/ui/useSignupForm"

const { signupUser } = vi.hoisted(() => ({ signupUser: vi.fn() }))

vi.mock("@/modules/auth/actions", () => ({ signupUser }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

describe("useSignupForm", () => {
  // 同登入: 連按 Enter 時第二次送出可能在畫面鎖住之前就到了, 第二個請求只會撞名回錯誤並算進限流。
  it("註冊送出中再次送出不會再呼叫 signupUser", async () => {
    const { promise, resolve } = Promise.withResolvers<ApiResponse>()
    signupUser.mockReturnValue(promise)
    const { result } = renderHook(() => useSignupForm())

    act(() => {
      result.current.changeValue("username", "newbie")
    })
    act(() => {
      result.current.changeValue("nickname", "Newbie")
    })
    act(() => {
      result.current.changeValue("password", "password-123")
    })
    act(() => {
      result.current.submit()
      result.current.submit()
    })
    await act(async () => resolve({ status: "success", code: 200, data: {}, message: "ok" }))

    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(signupUser).toHaveBeenCalledTimes(1)
  })
})
