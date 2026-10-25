/**
 * 下拉重新整理的規則, 與觸控事件分開才能不靠 DOM 測。
 *
 * 數字是指示器的位移 (px), 不是手指移動的距離: 手指要拉得比位移遠, 才有「拉著東西」的阻力感,
 * 也不會因為捲動時順手往下滑一點就觸發。
 */

export const PULL_THRESHOLD = 64
export const PULL_MAX = 96
const RESISTANCE = 0.5

export type PullState =
  | { phase: "idle" }
  | { phase: "pulling"; startY: number; offset: number }
  | { phase: "refreshing" }

type PullEvent =
  | { type: "start"; y: number; atTop: boolean }
  | { type: "move"; y: number }
  | { type: "end" }
  | { type: "done" }

export function pullOffset(distance: number): number {
  return Math.min(PULL_MAX, Math.max(0, distance * RESISTANCE))
}

const IDLE: PullState = { phase: "idle" }

export function pullReducer(state: PullState, event: PullEvent): PullState {
  // 進行中的重新整理只等 `done`: 再拉一次不該再送一次請求。
  if (state.phase === "refreshing") return event.type === "done" ? IDLE : state
  if (event.type === "start") return event.atTop ? { phase: "pulling", startY: event.y, offset: 0 } : IDLE
  if (state.phase === "idle") return state
  return pulling(state, event)
}

function pulling(state: Extract<PullState, { phase: "pulling" }>, event: PullEvent): PullState {
  if (event.type === "move") return { ...state, offset: pullOffset(event.y - state.startY) }
  if (event.type === "end") return state.offset >= PULL_THRESHOLD ? { phase: "refreshing" } : IDLE
  return state
}

/** 指示器該顯示哪一句; `null` 是不顯示 (沒在拉, 或往上滑)。 */
export function pullStatus(state: PullState): "pull" | "release" | "refreshing" | null {
  if (state.phase === "refreshing") return "refreshing"
  if (state.phase === "idle" || state.offset === 0) return null
  return state.offset >= PULL_THRESHOLD ? "release" : "pull"
}
