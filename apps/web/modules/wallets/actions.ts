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
