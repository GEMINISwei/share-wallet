/**
 * 標題列的重整按鈕: 點了 `router.refresh()`, 新畫面 render 完之前不能再點。
 *
 * `router.refresh()` 本身是一個 transition, 伺服器資料回來前會 suspend; 這裡用一個 suspend 在
 * 可控 promise 上的元件模擬, 按鈕看到的 pending 才跟真的一樣。
 */

import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Suspense, use, useEffect, useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import RefreshButton from "@/shared/ui/refresh-button"

const refresh = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}))

let startFetch: () => void = () => {}
let finishFetch: () => void = () => {}

/** 扮演伺服器資料: 重抓時 suspend, 直到 `finishFetch()`。 */
function ServerData() {
  const [pending, setPending] = useState<Promise<void> | null>(null)
  useEffect(() => {
    startFetch = () => {
      setPending(new Promise<void>((resolve) => {
        finishFetch = () => {
          resolve()
          setPending(null)
        }
      }))
    }
  }, [])
  if (pending) use(pending)
  return null
}

function renderButton() {
  render(
    <Suspense fallback={null}>
      <ServerData />
      <RefreshButton />
    </Suspense>,
  )
  return screen.getByRole("button", { name: "重新整理" })
}

describe("RefreshButton", () => {
  beforeEach(() => {
    refresh.mockReset()
    refresh.mockImplementation(() => startFetch())
  })

  it("有可讀的按鈕名稱", () => {
    expect(renderButton()).toBeInTheDocument()
  })

  it("點了會重抓伺服器資料", async () => {
    await userEvent.click(renderButton())

    expect(refresh).toHaveBeenCalledOnce()
  })

  it("重抓中不能再點", async () => {
    const button = renderButton()
    await userEvent.click(button)
    await userEvent.click(button)

    expect(refresh).toHaveBeenCalledOnce()
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("aria-busy", "true")
  })

  it("重抓完恢復可點", async () => {
    const button = renderButton()
    // userEvent 的 act 是同步的: 結束後才 resolve 的 suspend 不會被重試, 所以這裡用 async act 點。
    await act(async () => button.click())
    await act(async () => finishFetch())

    expect(button).toBeEnabled()
    await userEvent.click(button)
    expect(refresh).toHaveBeenCalledTimes(2)
  })
})
