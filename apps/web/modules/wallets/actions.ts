"use server"

import { apiDelete, apiPatch, apiPost } from "@/shared/api/request.server"
import type { ApiRequestBody } from "@/shared/api/contract"
import { WALLETS_PATH } from "./manifest"
import { walletPath } from "./paths"
import type { MemberRole } from "./types"

// 會改到列表內容 (名稱、餘額、自己還在不在) 的動作重新整理列表; 只動錢包內部的
// (成員角色、分類) 重新整理那個錢包。目前這一頁由畫面在成功後 `router.refresh()`。
const refreshWallets = { path: WALLETS_PATH }

export async function createWallet(data: ApiRequestBody<"/wallets/", "post">) {
  return apiPost({ url: "/wallets/", data, refresh: refreshWallets })
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
