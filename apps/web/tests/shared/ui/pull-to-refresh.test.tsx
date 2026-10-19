/**
 * 下拉重新整理元件: 觸控事件接到規則、規則接到 `router.refresh()`。
 *
 * 規則本身在 `pull.test.ts`; 這裡驗的是元件有沒有把事件接對 (頂端判斷看的是自己的捲動位置、
 * 對話框開著時不搶手勢), 這兩件事接錯時規則再對也沒用。
 */

import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PullToRefresh } from "@/shared/ui"

const refresh = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}))

function swipe(element: Element, from: number, to: number) {
  fireEvent.touchStart(element, { touches: [{ clientY: from }] })
  fireEvent.touchMove(element, { touches: [{ clientY: to }] })
}

function renderPull(children?: React.ReactNode) {
  render(<PullToRefresh as="main">{children ?? <p>內容</p>}</PullToRefresh>)
  return screen.getByRole("main")
}

describe("PullToRefresh", () => {
  beforeEach(() => refresh.mockReset())

  it("在頂端下拉超過門檻放開後重新整理", () => {
    const main = renderPull()
    swipe(main, 0, 1000)
    fireEvent.touchEnd(main)

    expect(refresh).toHaveBeenCalledOnce()
  })

  it("下拉未達門檻放開不重新整理", () => {
    const main = renderPull()
    swipe(main, 0, 10)
    fireEvent.touchEnd(main)

    expect(refresh).not.toHaveBeenCalled()
  })

  it("不在頂端時下拉不觸發", () => {
    const main = renderPull()
    Object.defineProperty(main, "scrollTop", { value: 100, configurable: true })
    swipe(main, 0, 1000)
    fireEvent.touchEnd(main)

    expect(refresh).not.toHaveBeenCalled()
  })

  it("往上滑不觸發", () => {
    const main = renderPull()
    swipe(main, 1000, 0)
    fireEvent.touchEnd(main)

    expect(refresh).not.toHaveBeenCalled()
  })

  it("對話框開著時下拉不觸發", () => {
    renderPull(<div role="dialog" aria-modal="true">對話框</div>)
    swipe(screen.getByRole("dialog"), 0, 1000)
    fireEvent.touchEnd(screen.getByRole("dialog"))

    expect(refresh).not.toHaveBeenCalled()
  })

  it("指示器依狀態顯示對應的文字", () => {
    const main = renderPull()
    expect(screen.getByRole("status")).toHaveTextContent("")

    fireEvent.touchStart(main, { touches: [{ clientY: 0 }] })
    fireEvent.touchMove(main, { touches: [{ clientY: 10 }] })
    expect(screen.getByRole("status")).toHaveTextContent("下拉重新整理")

    fireEvent.touchMove(main, { touches: [{ clientY: 1000 }] })
    expect(screen.getByRole("status")).toHaveTextContent("放開以重新整理")
  })
})
