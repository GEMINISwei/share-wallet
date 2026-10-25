/**
 * 下拉重新整理的狀態與位移計算。
 *
 * 為什麼值得測: 這是手勢的全部規則 (何時開始、拉多遠才算、進行中不重複觸發),
 * 元件只負責把觸控事件轉成這裡的事件; 規則錯了, 使用者會遇到「放開沒反應」或「一直重抓」。
 */

import { describe, expect, it } from "vitest"
import { PULL_MAX, PULL_THRESHOLD, pullOffset, pullReducer, pullStatus, type PullState } from "@/shared/ui/pull"

const idle: PullState = { phase: "idle" }

function pullTo(distance: number): PullState {
  const started = pullReducer(idle, { type: "start", y: 0, atTop: true })
  return pullReducer(started, { type: "move", y: distance })
}

describe("pullOffset", () => {
  it("下拉位移有阻力且有上限", () => {
    expect(pullOffset(100)).toBeLessThan(100)
    expect(pullOffset(100)).toBeGreaterThan(0)
    expect(pullOffset(10_000)).toBe(PULL_MAX)
  })

  it("往上滑時位移是 0", () => {
    expect(pullOffset(-50)).toBe(0)
  })
})

describe("pullReducer", () => {
  it("在頂端下拉超過門檻放開後進入重新整理", () => {
    const pulled = pullTo(10_000)
    expect(pullReducer(pulled, { type: "end" })).toEqual({ phase: "refreshing" })
  })

  it("下拉未達門檻放開不重新整理", () => {
    const pulled = pullTo(10)
    expect(pullStatus(pulled)).toBe("pull")
    expect(pullReducer(pulled, { type: "end" })).toEqual(idle)
  })

  it("不在頂端時下拉不觸發", () => {
    const started = pullReducer(idle, { type: "start", y: 0, atTop: false })
    const moved = pullReducer(started, { type: "move", y: 10_000 })
    expect(pullReducer(moved, { type: "end" })).toEqual(idle)
  })

  it("往上滑不觸發", () => {
    const pulled = pullTo(-10_000)
    expect(pullReducer(pulled, { type: "end" })).toEqual(idle)
  })

  it("重新整理進行中再次下拉不重複觸發", () => {
    const refreshing: PullState = { phase: "refreshing" }
    const started = pullReducer(refreshing, { type: "start", y: 0, atTop: true })
    const moved = pullReducer(started, { type: "move", y: 10_000 })
    expect(pullReducer(moved, { type: "end" })).toEqual(refreshing)
    expect(pullReducer(refreshing, { type: "done" })).toEqual(idle)
  })
})

describe("pullStatus", () => {
  it("指示器依狀態顯示對應的文字", () => {
    expect(pullStatus(idle)).toBeNull()
    expect(pullStatus(pullTo(-10))).toBeNull()
    expect(pullStatus(pullTo(10))).toBe("pull")
    expect(pullOffset(10_000)).toBeGreaterThanOrEqual(PULL_THRESHOLD)
    expect(pullStatus(pullTo(10_000))).toBe("release")
    expect(pullStatus({ phase: "refreshing" })).toBe("refreshing")
  })
})
