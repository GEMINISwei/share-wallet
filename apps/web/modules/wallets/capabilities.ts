import type {
  AdvanceTargetInfo, CategoryInfo, CategoryType, EntryFormValues, EntryInfo, EntryKind,
  EntryLogInfo, EntrySnapshot, ExpenseFormValues, ExpenseInfo, ExpenseLogInfo, ExpenseSnapshot,
  MemberInfo, NetBalanceInfo, SettlementTransferInfo, ShareRowValues, TransferKind, TransferTarget,
  WalletAdmin, WalletInfo, WalletKind, WalletStatus,
} from "./types"

// 畫面上的分支。真正的授權在後端 (`modules/wallets/access.py`), 這裡只決定顯示哪些操作,
// 規則要與後端同一組: 管理者 (或超級管理者, 後端給的 `can_manage`) 才能管理,
// 錢包至少要有一位管理者。

/** 錢包列表的分頁。沒有或不認得的參數回到預設的一般分頁, 不報錯。 */
export function walletListTab(param: string | undefined): WalletKind {
  return param === "travel" ? "travel" : "general"
}

/** 分頁裡的錢包。排序 (最愛在前、已結帳最後) 由後端決定, 這裡只篩不排。 */
export function walletsOfTab(wallets: readonly WalletInfo[], tab: WalletKind) {
  return wallets.filter((wallet) => wallet.kind === tab)
}

/** 錢包頁上要列出哪些入口。分類只屬於一般錢包, 設定只給管理者。 */
export function walletSections(wallet: WalletInfo) {
  return {
    members: true,
    categories: wallet.kind === "general",
    history: true,
    settings: wallet.can_manage,
  }
}

export type WalletMenuItem =
  | "adjust" | "owing" | "startSettlement" | "cancelSettlement" | "netBalances"
  | "members" | "categories" | "history" | "settings" | "favorite"

type WalletPageState = {
  /** 帳目與成員都載入成功。 */
  ready: boolean
  /** 一般錢包有沒有還沒還清的代墊; 都還清時選單不放代墊未還。 */
  hasOwing: boolean
  /** 旅遊錢包有沒有任何帳目。 */
  hasExpenses: boolean
}

/** 手機錢包頁 ⋮ 選單的項目, 依顯示順序 (見 docs/features.md〈錢包頁的版面〉)。 */
export function walletMenuItems(wallet: WalletInfo, state: WalletPageState): WalletMenuItem[] {
  const sections = walletSections(wallet)
  const travel = travelActions(wallet)
  const head: (WalletMenuItem | false)[] = wallet.kind === "general"
    ? ["adjust", state.hasOwing && "owing"]
    : [
      canStartSettlement(wallet, state.ready, state.hasExpenses) && "startSettlement",
      travel.cancelSettlement && "cancelSettlement",
      "netBalances",
    ]
  const items: (WalletMenuItem | false)[] = [
    ...head,
    sections.members && "members",
    sections.categories && "categories",
    sections.history && "history",
    sections.settings && "settings",
    // 最愛記在自己的成員紀錄上, 沒加入的超級管理者沒有。
    wallet.my_role !== null && "favorite",
  ]
  return items.filter((item): item is WalletMenuItem => item !== false)
}

/**
 * 開始結算: 管理者、進行中, 還要有帳目 (後端也擋, 見 docs/features.md〈結算流程〉)。
 * 載入失敗時管理者看不到要結算的帳, 也不給按。
 */
export function canStartSettlement(wallet: WalletInfo, ready: boolean, hasExpenses: boolean) {
  return ready && hasExpenses && travelActions(wallet).startSettlement
}

/** 摘要列的「記一筆」: 資料載入成功才能記; 旅遊錢包還要是進行中 (結算中帳目鎖住)。 */
export function canAddEntry(wallet: WalletInfo, ready: boolean) {
  return addEntryBlock(wallet, ready) === null
}

export type AddEntryBlock = "settling" | "settled" | "loadFailed"

/**
 * 底部導覽的「＋」為什麼不能記帳; 可以記時是 null。
 * 錢包狀態優先: 結算中的錢包就算重新整理也不能記, 說「沒載入」會讓人白試一次。
 */
export function addEntryBlock(wallet: WalletInfo, ready: boolean): AddEntryBlock | null {
  if (wallet.kind === "travel" && !travelActions(wallet).addEntry) {
    return wallet.status === "settled" ? "settled" : "settling"
  }
  return ready ? null : "loadFailed"
}

export type AddEntryPickerItem = { wallet: WalletInfo; block: AddEntryBlock | null }

/**
 * 「＋」在錢包頁以外打開的選錢包面板。順序沿用列表 (後端已把最愛排前面)。
 * 已結帳的旅遊錢包不列: 一趟趟旅程會越積越多, 而且永遠不能再記。
 */
export function addEntryPickerGroups(wallets: readonly WalletInfo[]) {
  const items = wallets
    .filter((wallet) => wallet.status !== "settled")
    .map((wallet): AddEntryPickerItem => ({ wallet, block: addEntryBlock(wallet, true) }))
  return {
    general: items.filter((item) => item.wallet.kind === "general"),
    travel: items.filter((item) => item.wallet.kind === "travel"),
  }
}

/** 旅遊錢包摘要列的「我的淨額」。沒加入 (超級管理者) 或淨額載入失敗時沒有。 */
export function myNetBalance(
  balances: readonly Pick<NetBalanceInfo, "user_id" | "net">[],
  userId: string,
  failed: boolean,
): number | null {
  if (failed) return null
  return balances.find((balance) => balance.user_id === userId)?.net ?? null
}

function adminCount(members: readonly MemberInfo[]) {
  return members.filter((member) => member.role === "admin").length
}

/** 這位成員是不是唯一的管理者: 不能降級、不能離開、不能被移除。 */
export function isLastAdmin(member: MemberInfo, members: readonly MemberInfo[]) {
  return member.role === "admin" && adminCount(members) <= 1
}

export type MemberActions = {
  promote: boolean
  demote: boolean
  remove: boolean
  leave: boolean
}

type Viewer = { userId: string; canManage: boolean }

/**
 * 成員清單上某一列可以做的事。自己那一列是「離開」, 別人那一列 (管理者才有) 是「移出」。
 * 已結帳的旅遊錢包只剩離開 (見 docs/features.md〈封存〉)。
 */
export function memberActions(
  member: MemberInfo,
  members: readonly MemberInfo[],
  viewer: Viewer,
  archived = false,
): MemberActions {
  const isSelf = member.user_id === viewer.userId
  const last = isLastAdmin(member, members)
  const manage = viewer.canManage && !archived
  return {
    promote: manage && member.role === "member",
    demote: manage && member.role === "admin" && !last,
    remove: manage && !isSelf && !last,
    leave: isSelf && !last,
  }
}

/** 已結帳的旅遊錢包封存, 只能查看。 */
export function isArchived(wallet: WalletInfo) {
  return wallet.status === "settled"
}

/** 管理者才看得到邀請連結; 已結帳的錢包不能邀請。 */
export function canInvite(wallet: WalletInfo) {
  return wallet.can_manage && !isArchived(wallet)
}

/** 錢包列表與標題上的狀態標籤: 進行中不標。 */
export function walletStatusBadge(wallet: Pick<WalletInfo, "status">): Exclude<WalletStatus, "active"> | null {
  return wallet.status === "active" ? null : wallet.status
}

/** 依類型分組, 組內維持後端給的順序 (建立順序)。 */
export function groupCategories(
  categories: readonly CategoryInfo[],
): Record<CategoryType, CategoryInfo[]> {
  return {
    income: categories.filter((category) => category.type === "income"),
    expense: categories.filter((category) => category.type === "expense"),
  }
}

/**
 * 後台列表的管理者欄位只放得下一個名字: 第一位管理者, 加上總共幾位 (超過一位時)。
 * 完整的名單點開再看。
 */
export function adminsSummary(admins: readonly WalletAdmin[]) {
  return { first: admins[0]?.nickname ?? "", count: admins.length, more: admins.length - 1 }
}

export function isTransfer(kind: EntryKind): kind is TransferKind {
  return kind === "transfer_out" || kind === "transfer_in"
}

function canModify(ownerId: string, viewer: Viewer) {
  return ownerId === viewer.userId || viewer.canManage
}

/**
 * 這筆帳可以做的事。自己記的帳, 或管理者 (含超級管理者) 改任何人的; 調整只能刪不能改,
 * 對方錢包已刪除的轉帳也是。轉帳還要對方錢包的權限, 這裡看不到, 由後端擋。
 */
export function entryActions(entry: EntryInfo, viewer: Viewer) {
  const allowed = canModify(entry.created_by.user_id, viewer)
  const orphan = isTransfer(entry.kind) && entry.counterpart_wallet === null
  return { edit: allowed && entry.kind !== "adjustment" && !orphan, delete: allowed }
}

/** 轉帳的對方錢包選單: 自己加入的其他一般錢包, 依錢包列表的順序。 */
export function transferTargets(
  wallets: readonly WalletInfo[],
  currentWalletId: string,
): TransferTarget[] {
  return wallets
    .filter((wallet) => wallet.kind === "general" && wallet.id !== currentWalletId)
    .map(({ id, name }) => ({ id, name }))
}

/** 建立轉帳要自己是這個錢包的成員 (超級管理者沒加入也不行), 而且有可以轉的對象。 */
export function canTransfer(wallet: WalletInfo, targets: readonly TransferTarget[]) {
  return wallet.my_role !== null && targets.length > 0
}

/**
 * 記一筆能選的類型。修改時收支只能互換, 轉帳與代墊不能切換類型
 * (見 docs/features.md〈轉帳〉〈代墊與還款〉)。還款不從記一筆記, 而是從代墊的詳情。
 */
export function entryKindOptions(
  entry: EntryInfo | null,
  transferable: boolean,
): EntryFormValues["kind"][] {
  if (entry && (isTransfer(entry.kind) || entry.kind === "advance")) return [entry.kind]
  if (entry) return ["expense", "income"]
  const transfers = transferable ? (["transfer_out", "transfer_in"] as const) : []
  return ["expense", "income", "advance", ...transfers]
}

/** 還有未還金額的代墊才能還款。任何看得到錢包的人都能記, 不限代墊的記帳人。 */
export function canRepay(entry: EntryInfo) {
  return entry.kind === "advance" && (entry.outstanding ?? 0) > 0
}

/** 錢包頁的代墊未還清單: 只列還沒還清的人, 順序照後端 (依名字)。 */
export function owingTargets(targets: readonly AdvanceTargetInfo[]) {
  return targets.filter((target) => target.outstanding > 0)
}

type CategoryOption = { id: string; name: string }

/**
 * 記帳時能選的分類: 這個類型、還沒封存的。修改時再加上這筆帳原本的分類 —— 它可能已經封存,
 * 而後端允許保留 (見 docs/features.md〈收入與支出〉); 換了類型就不留。
 */
export function entryCategoryOptions(
  categories: readonly CategoryInfo[],
  type: EntryFormValues["kind"],
  entry: EntryInfo | null,
): CategoryOption[] {
  if (isTransfer(type) || type === "advance") return []
  const options = categories
    .filter((category) => category.type === type)
    .map(({ id, name }) => ({ id, name }))
  const current = entry?.kind === type ? entry.category : null
  if (current && !options.some((option) => option.id === current.id)) options.push(current)
  return options
}

const SNAPSHOT_FIELDS = [
  "kind", "amount", "category_name", "counterpart_wallet_name", "advance_target_name",
  "entry_date", "note",
] as const

/** 修改紀錄裡改了哪些欄位, 依畫面上的順序。新增與刪除沒有「改前改後」, 是空的。 */
export function changedFields(log: EntryLogInfo): (keyof EntrySnapshot)[] {
  const { before, after } = log
  if (!before || !after) return []
  return SNAPSHOT_FIELDS.filter((field) => (before[field] ?? null) !== (after[field] ?? null))
}

// ── 旅遊錢包 ────────────────────────────────────────────────────────────────

/**
 * 旅遊錢包的帳: 權限同一般錢包, 所有欄位都可以改 (見 docs/features.md〈記帳〉)。
 * 開始結算之後帳目鎖住 (`locked`), 誰都不能改刪。
 */
export function expenseActions(expense: ExpenseInfo, viewer: Viewer, locked = false) {
  const allowed = !locked && canModify(expense.created_by.user_id, viewer)
  return { edit: allowed, delete: allowed }
}

/** 旅遊錢包頁標題列的操作: 進行中記帳、管理者開始結算; 結算中管理者可以取消。 */
export function travelActions(wallet: WalletInfo) {
  return {
    addEntry: wallet.status === "active",
    startSettlement: wallet.can_manage && wallet.status === "active",
    cancelSettlement: wallet.can_manage && wallet.status === "settling",
  }
}

/**
 * 清償方案某一筆可以做的事, 規則同後端 (`settlement.py`): 付款人標記、撤回「我已付款」;
 * 收款人或管理者確認 (付款人自己不行), 確認的人或管理者撤銷。都只在結算中。
 */
export function settlementTransferActions(
  transfer: SettlementTransferInfo,
  viewer: Viewer,
  status: WalletStatus,
) {
  const settling = status === "settling"
  const confirmed = transfer.confirmed_at !== null
  const open = settling && !confirmed
  const isPayer = transfer.payer.user_id === viewer.userId
  const payerOpen = open && isPayer
  return {
    markPaid: payerOpen && transfer.paid_at === null,
    unmarkPaid: payerOpen && transfer.paid_at !== null,
    confirm: open && !isPayer && isSelfOrAdmin(transfer.payee.user_id, viewer),
    unconfirm: settling && confirmed && isSelfOrAdmin(transfer.confirmed_by?.user_id, viewer),
  }
}

function isSelfOrAdmin(userId: string | undefined, viewer: Viewer) {
  return userId === viewer.userId || viewer.canManage
}

/** 方案的顯示順序: 跟自己有關 (要付或要收) 的排最前面, 其餘維持後端的順序。 */
export function transfersForViewer(
  transfers: readonly SettlementTransferInfo[],
  userId: string,
): SettlementTransferInfo[] {
  const mine = (t: SettlementTransferInfo) =>
    t.payer.user_id === userId || t.payee.user_id === userId
  return [...transfers.filter(mine), ...transfers.filter((t) => !mine(t))]
}

type Share = { user_id: string; amount: number }

/**
 * 均分的結果, 給記帳時預覽; 實際存的值由後端算 (`expenses.split_equally`), 規則要同一組:
 * 零頭一人一份, 付款人優先, 其餘照加入順序 (`memberIds`); 結果依加入順序排列。
 */
export function splitEqually(
  amount: number,
  payerId: string,
  participantIds: readonly string[],
  memberIds: readonly string[],
): Share[] {
  const ordered = memberIds.filter((id) => participantIds.includes(id))
  if (ordered.length === 0) return []
  const base = Math.floor(amount / ordered.length)
  const remainder = amount - base * ordered.length
  const payerFirst = [
    ...ordered.filter((id) => id === payerId), ...ordered.filter((id) => id !== payerId),
  ]
  const extra = new Set(payerFirst.slice(0, remainder))
  return ordered.map((id) => ({ user_id: id, amount: base + (extra.has(id) ? 1 : 0) }))
}

let rowSeq = 0

/** 指定金額表的新一列。 */
export function newShareRow(userId = "", amount = ""): ShareRowValues {
  rowSeq += 1
  return { key: `row-${rowSeq}`, user_id: userId, amount }
}

/**
 * 記一筆與修改的初始值。記一筆時付款人是自己 (不是成員, 例如超級管理者, 就留空)、
 * 均分給所有成員; 修改時帶入原本的值, 指定金額的每一列照原本的順序。
 */
export function initialExpenseValues(
  expense: ExpenseInfo | null,
  members: readonly MemberInfo[],
  currentUserId: string,
  today: string,
): ExpenseFormValues {
  const memberIds = members.map((member) => member.user_id)
  if (!expense) {
    return {
      amount: "", payer_id: memberIds.includes(currentUserId) ? currentUserId : "",
      split_mode: "equal", participant_ids: memberIds, shares: [], entry_date: today, note: "",
    }
  }
  const custom = expense.split_mode === "custom"
  return {
    amount: String(expense.amount),
    payer_id: expense.payer.user_id,
    split_mode: expense.split_mode,
    participant_ids: custom ? memberIds : expense.shares.map((share) => share.user_id),
    shares: custom
      ? expense.shares.map((share) => newShareRow(share.user_id, String(share.amount)))
      : [],
    entry_date: expense.entry_date,
    note: expense.note,
  }
}

/** 指定金額表某一列能選的人: 其他列已經選的人不再出現 (同一個人不能出現兩次)。 */
export function shareUserOptions(
  members: readonly MemberInfo[],
  rows: readonly ShareRowValues[],
  rowKey: string,
): MemberInfo[] {
  const taken = new Set(rows.filter((row) => row.key !== rowKey).map((row) => row.user_id))
  return members.filter((member) => !taken.has(member.user_id))
}

const EXPENSE_FIELDS = [
  "payer_name", "split_mode", "shares", "amount", "entry_date", "note",
] as const satisfies readonly (keyof ExpenseSnapshot)[]

/** 旅遊錢包的修改紀錄改了哪些欄位, 依畫面上的順序。分攤比對每一人的名字與金額。 */
export function expenseChangedFields(log: ExpenseLogInfo): (keyof ExpenseSnapshot)[] {
  const { before, after } = log
  if (!before || !after) return []
  return EXPENSE_FIELDS.filter(
    (field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]),
  )
}
