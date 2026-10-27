"use server"

import { apiDelete, apiGet, apiPatch, apiPost } from "@/shared/api/request.server"
import type { ApiRequestBody } from "@/shared/api/contract"
import { ADMIN_WALLETS_PATH, WALLETS_PATH } from "./manifest"
import { walletPath } from "./paths"
import type { MemberRole } from "./types"

// 會改到列表內容 (名稱、餘額、自己還在不在) 的動作重新整理列表; 只動錢包內部的
// (成員角色、分類) 重新整理那個錢包。目前這一頁由畫面在成功後 `router.refresh()`。
const refreshWallets = { path: WALLETS_PATH }

export async function createWallet(data: ApiRequestBody<"/wallets/", "post">) {
  return apiPost({ url: "/wallets/", data, refresh: refreshWallets })
}

/** 後台替指定的使用者建立錢包。 */
export async function createWalletForUser(data: ApiRequestBody<"/admin/wallets/", "post">) {
  return apiPost({ url: "/admin/wallets/", data, refresh: { path: ADMIN_WALLETS_PATH } })
}

export async function updateWallet(id: string, data: ApiRequestBody<"/wallets/{id}", "patch">) {
  return apiPatch({ url: "/wallets/{id}", params: { id }, data, refresh: refreshWallets })
}

/** 只影響自己的列表排序; 錢包頁由畫面在成功後 `router.refresh()`。 */
export async function setFavorite(id: string, isFavorite: boolean) {
  return apiPatch({
    url: "/wallets/{id}/favorite", params: { id }, data: { is_favorite: isFavorite },
    refresh: refreshWallets,
  })
}

export async function deleteWallet(id: string) {
  return apiDelete({ url: "/wallets/{id}", params: { id }, refresh: refreshWallets })
}

export async function updateMemberRole(id: string, userId: string, role: MemberRole) {
  return apiPatch({
    url: "/wallets/{id}/members/{user_id}",
    params: { id, user_id: userId },
    data: { role },
    refresh: { path: walletPath(id) },
  })
}

/** `userId` 是自己時就是離開錢包。 */
export async function removeMember(id: string, userId: string) {
  return apiDelete({
    url: "/wallets/{id}/members/{user_id}",
    params: { id, user_id: userId },
    refresh: refreshWallets,
  })
}

export async function createCategory(
  id: string,
  data: ApiRequestBody<"/wallets/{id}/categories", "post">,
) {
  return apiPost({
    url: "/wallets/{id}/categories", params: { id }, data, refresh: { path: walletPath(id) },
  })
}

export async function renameCategory(id: string, categoryId: string, name: string) {
  return apiPatch({
    url: "/wallets/{id}/categories/{category_id}",
    params: { id, category_id: categoryId },
    data: { name },
    refresh: { path: walletPath(id) },
  })
}

export async function deleteCategory(id: string, categoryId: string) {
  return apiDelete({
    url: "/wallets/{id}/categories/{category_id}",
    params: { id, category_id: categoryId },
    refresh: { path: walletPath(id) },
  })
}

/** 產生或重新產生邀請連結, 舊的立即失效。 */
export async function createInvite(id: string) {
  return apiPost({ url: "/wallets/{id}/invite", params: { id }, refresh: { path: walletPath(id) } })
}

export async function revokeInvite(id: string) {
  return apiDelete({ url: "/wallets/{id}/invite", params: { id }, refresh: { path: walletPath(id) } })
}

/** 加入之後錢包列表多了一個錢包。 */
export async function acceptInvite(token: string) {
  return apiPost({ url: "/invites/{token}/accept", params: { token }, refresh: refreshWallets })
}

// 記帳會改到餘額, 也就改到錢包列表的總額, 所以重新整理列表。
type EntryRequest = ApiRequestBody<"/wallets/{id}/entries", "post">

export async function createEntry(id: string, data: EntryRequest) {
  return apiPost({ url: "/wallets/{id}/entries", params: { id }, data, refresh: refreshWallets })
}

export async function updateEntry(id: string, entryId: string, data: EntryRequest) {
  return apiPatch({
    url: "/wallets/{id}/entries/{entry_id}",
    params: { id, entry_id: entryId },
    data,
    refresh: refreshWallets,
  })
}

export async function deleteEntry(id: string, entryId: string) {
  return apiDelete({
    url: "/wallets/{id}/entries/{entry_id}",
    params: { id, entry_id: entryId },
    refresh: refreshWallets,
  })
}

export async function createTransfer(
  id: string,
  data: ApiRequestBody<"/wallets/{id}/transfers", "post">,
) {
  return apiPost({ url: "/wallets/{id}/transfers", params: { id }, data, refresh: refreshWallets })
}

export async function updateTransfer(
  id: string,
  entryId: string,
  data: ApiRequestBody<"/wallets/{id}/transfers/{entry_id}", "patch">,
) {
  return apiPatch({
    url: "/wallets/{id}/transfers/{entry_id}",
    params: { id, entry_id: entryId },
    data,
    refresh: refreshWallets,
  })
}

type MoneyRequest = ApiRequestBody<"/wallets/{id}/advances/{entry_id}", "patch">

export async function createAdvance(
  id: string,
  data: ApiRequestBody<"/wallets/{id}/advances", "post">,
) {
  return apiPost({ url: "/wallets/{id}/advances", params: { id }, data, refresh: refreshWallets })
}

export async function updateAdvance(id: string, entryId: string, data: MoneyRequest) {
  return apiPatch({
    url: "/wallets/{id}/advances/{entry_id}",
    params: { id, entry_id: entryId },
    data,
    refresh: refreshWallets,
  })
}

export async function createRepayment(id: string, advanceId: string, data: MoneyRequest) {
  return apiPost({
    url: "/wallets/{id}/advances/{entry_id}/repayments",
    params: { id, entry_id: advanceId },
    data,
    refresh: refreshWallets,
  })
}

export async function updateRepayment(id: string, entryId: string, data: MoneyRequest) {
  return apiPatch({
    url: "/wallets/{id}/repayments/{entry_id}",
    params: { id, entry_id: entryId },
    data,
    refresh: refreshWallets,
  })
}

export async function adjustBalance(
  id: string,
  data: ApiRequestBody<"/wallets/{id}/adjustments", "post">,
) {
  return apiPost({ url: "/wallets/{id}/adjustments", params: { id }, data, refresh: refreshWallets })
}

// 「載入更多」與帳目詳情的歷史是使用者點了才取, 不在頁面 render 時一起取: 每筆帳都先取歷史
// 太浪費, 而下一頁要接在畫面上已經有的帳後面, 不是換掉整頁。
export async function loadMoreEntries(id: string, cursor: string) {
  return apiGet({ url: "/wallets/{id}/entries", params: { id }, query: { cursor } })
}

/** 底部導覽「＋」的選錢包面板與旅遊帳的同步選單: 用到才取, 不讓每一頁都多打一次列表。 */
export async function loadMyWallets() {
  return apiGet({ url: "/wallets/" })
}

export async function loadEntryLogs(id: string, entryId: string) {
  return apiGet({
    url: "/wallets/{id}/entries/{entry_id}/logs", params: { id, entry_id: entryId },
  })
}

export async function loadMoreWalletLogs(id: string, cursor: string) {
  return apiGet({ url: "/wallets/{id}/entry-logs", params: { id }, query: { cursor } })
}

export async function loadRepayments(id: string, advanceId: string) {
  return apiGet({
    url: "/wallets/{id}/advances/{entry_id}/repayments", params: { id, entry_id: advanceId },
  })
}

// 旅遊錢包沒有餘額, 記帳不影響錢包列表, 只重新整理這個錢包。
export async function createExpense(
  id: string, data: ApiRequestBody<"/wallets/{id}/expenses", "post">,
) {
  return apiPost({
    url: "/wallets/{id}/expenses", params: { id }, data, refresh: { path: walletPath(id) },
  })
}

/** 同步到一般錢包時, 選了錢包才取它的分類。 */
export async function loadCategories(id: string) {
  return apiGet({ url: "/wallets/{id}/categories", params: { id } })
}

export async function updateExpense(
  id: string, expenseId: string, data: ApiRequestBody<"/wallets/{id}/expenses/{expense_id}", "patch">,
) {
  return apiPatch({
    url: "/wallets/{id}/expenses/{expense_id}",
    params: { id, expense_id: expenseId },
    data,
    refresh: { path: walletPath(id) },
  })
}

export async function deleteExpense(id: string, expenseId: string) {
  return apiDelete({
    url: "/wallets/{id}/expenses/{expense_id}",
    params: { id, expense_id: expenseId },
    refresh: { path: walletPath(id) },
  })
}

export async function loadMoreExpenses(id: string, cursor: string) {
  return apiGet({ url: "/wallets/{id}/expenses", params: { id }, query: { cursor } })
}

export async function loadExpenseLogs(id: string, expenseId: string) {
  return apiGet({
    url: "/wallets/{id}/expenses/{expense_id}/logs", params: { id, expense_id: expenseId },
  })
}

export async function loadMoreExpenseLogs(id: string, cursor: string) {
  return apiGet({ url: "/wallets/{id}/expense-logs", params: { id }, query: { cursor } })
}

// 結算會改變錢包的狀態 (列表上的標籤與排序), 開始、取消與確認收款重新整理列表;
// 標記付款只動這個錢包。
export async function startSettlement(id: string) {
  return apiPost({ url: "/wallets/{id}/settlement", params: { id }, refresh: refreshWallets })
}

export async function cancelSettlement(id: string) {
  return apiDelete({ url: "/wallets/{id}/settlement", params: { id }, refresh: refreshWallets })
}

const transferUrl = "/wallets/{id}/settlement/transfers/{transfer_id}"

export async function markSettlementPaid(id: string, transferId: string, paid: boolean) {
  const request = {
    url: `${transferUrl}/paid` as const,
    params: { id, transfer_id: transferId },
    refresh: { path: walletPath(id) },
  }
  return paid ? apiPost(request) : apiDelete(request)
}

export async function confirmSettlementTransfer(
  id: string, transferId: string, confirmed: boolean,
) {
  const request = {
    url: `${transferUrl}/confirmation` as const,
    params: { id, transfer_id: transferId },
    refresh: refreshWallets,
  }
  return confirmed ? apiPost(request) : apiDelete(request)
}

// 錢包群組與顯示都是自己的設定, 會改到列表 (依群組分區、不顯示的不列出);
// 錢包設定頁本身由畫面在成功後 `router.refresh()`。
const refreshGroups = refreshWallets

export async function createWalletGroup(data: ApiRequestBody<"/wallet-groups/", "post">) {
  return apiPost({ url: "/wallet-groups/", data, refresh: refreshGroups })
}

export async function renameWalletGroup(id: string, name: string) {
  return apiPatch({
    url: "/wallet-groups/{id}", params: { id }, data: { name }, refresh: refreshGroups,
  })
}

export async function deleteWalletGroup(id: string) {
  return apiDelete({ url: "/wallet-groups/{id}", params: { id }, refresh: refreshGroups })
}

export async function moveWalletGroup(id: string, direction: "up" | "down") {
  return apiPost({
    url: "/wallet-groups/{id}/move", params: { id }, data: { direction }, refresh: refreshGroups,
  })
}

export async function setWalletGroup(id: string, groupId: string) {
  return apiPatch({
    url: "/wallets/{id}/group", params: { id }, data: { group_id: groupId }, refresh: refreshGroups,
  })
}

export async function setWalletVisibility(id: string, isHidden: boolean) {
  return apiPatch({
    url: "/wallets/{id}/visibility", params: { id }, data: { is_hidden: isHidden },
    refresh: refreshGroups,
  })
}

/** 導覽的群組清單與「＋」的選錢包面板: 在瀏覽器端取, 不讓每一頁的伺服器端多打一次。 */
export async function loadMyGroups() {
  return apiGet({ url: "/wallet-groups/" })
}
