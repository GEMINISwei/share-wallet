import type {
  CategoryInfo, CategoryType, EntryInfo, EntryLogInfo, EntrySnapshot, MemberInfo, WalletAdmin,
  WalletInfo,
} from "./types"

// 畫面上的分支。真正的授權在後端 (`modules/wallets/access.py`), 這裡只決定顯示哪些操作,
// 規則要與後端同一組: 管理者 (或超級管理者, 後端給的 `can_manage`) 才能管理,
// 錢包至少要有一位管理者。

/** 錢包頁上要列出哪些入口。分類與異動紀錄只屬於一般錢包, 設定只給管理者。 */
export function walletSections(wallet: WalletInfo) {
  return {
    members: true,
    categories: wallet.kind === "general",
    history: wallet.kind === "general",
    settings: wallet.can_manage,
  }
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

/** 成員清單上某一列可以做的事。自己那一列是「離開」, 別人那一列 (管理者才有) 是「移出」。 */
export function memberActions(
  member: MemberInfo,
  members: readonly MemberInfo[],
  viewer: Viewer,
): MemberActions {
  const isSelf = member.user_id === viewer.userId
  const last = isLastAdmin(member, members)
  return {
    promote: viewer.canManage && member.role === "member",
    demote: viewer.canManage && member.role === "admin" && !last,
    remove: viewer.canManage && !isSelf && !last,
    leave: isSelf && !last,
  }
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

/** 這筆帳可以做的事。自己記的帳, 或管理者 (含超級管理者) 改任何人的; 調整只能刪不能改。 */
export function entryActions(entry: EntryInfo, viewer: Viewer) {
  const allowed = entry.created_by.user_id === viewer.userId || viewer.canManage
  return { edit: allowed && entry.kind !== "adjustment", delete: allowed }
}

type CategoryOption = { id: string; name: string }

/**
 * 記帳時能選的分類: 這個類型、還沒封存的。修改時再加上這筆帳原本的分類 —— 它可能已經封存,
 * 而後端允許保留 (見 docs/features.md〈收入與支出〉); 換了類型就不留。
 */
export function entryCategoryOptions(
  categories: readonly CategoryInfo[],
  type: CategoryType,
  entry: EntryInfo | null,
): CategoryOption[] {
  const options = categories
    .filter((category) => category.type === type)
    .map(({ id, name }) => ({ id, name }))
  const current = entry?.kind === type ? entry.category : null
  if (current && !options.some((option) => option.id === current.id)) options.push(current)
  return options
}

const SNAPSHOT_FIELDS = ["kind", "amount", "category_name", "entry_date", "note"] as const

/** 修改紀錄裡改了哪些欄位, 依畫面上的順序。新增與刪除沒有「改前改後」, 是空的。 */
export function changedFields(log: EntryLogInfo): (keyof EntrySnapshot)[] {
  const { before, after } = log
  if (!before || !after) return []
  return SNAPSHOT_FIELDS.filter((field) => before[field] !== after[field])
}
