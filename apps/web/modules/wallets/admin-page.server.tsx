import "server-only"
import { apiGet } from "@/shared/api/request.server"
import { getApiResponseErrorMessage } from "@/shared/api/error"
import { getApiListData } from "@/shared/api/response"
import { fetchPaginatedList, parsePagination } from "@/shared/pagination/fetch.server"
import { getT } from "@/shared/i18n/locale.server"
import { walletsMessages } from "./i18n"
import type { AdminWalletFilters } from "./types"
import AdminWalletsView from "./ui/AdminWalletsView"

export async function generateMetadata() {
  return { title: (await getT(walletsMessages))("adminPageTitle") }
}

const ADMIN_WALLETS_PAGE_LIMIT = 10

export type AdminWalletsPageProps = {
  searchParams?: Promise<{
    cursor?: string
    direction?: string
    seq?: string
    name?: string
    kind?: string
  }>
}

function parseKind(value?: string): AdminWalletFilters["kind"] {
  return value === "general" || value === "travel" ? value : ""
}

export default async function AdminWalletsPage({ searchParams }: AdminWalletsPageProps) {
  const t = await getT(walletsMessages)
  const params = await searchParams
  const { cursor, direction, seq } = parsePagination(params)
  const filters: AdminWalletFilters = { name: params?.name ?? "", kind: parseKind(params?.kind) }

  const [walletsResult, usersRes] = await Promise.all([
    fetchPaginatedList({
      url: "/admin/wallets/",
      limit: ADMIN_WALLETS_PAGE_LIMIT,
      cursor,
      direction,
      query: {
        ...(filters.name ? { name: filters.name } : {}),
        ...(filters.kind ? { kind: filters.kind } : {}),
      },
      errorFallback: t("listFailed"),
    }),
    // 建立錢包時選管理者用, 所以是完整的清單而不是分頁。
    apiGet({ url: "/users/options" }),
  ])

  return (
    <AdminWalletsView
      wallets={walletsResult.items}
      meta={walletsResult.meta}
      seq={seq}
      limit={ADMIN_WALLETS_PAGE_LIMIT}
      users={getApiListData(usersRes)}
      errorMessage={walletsResult.errorMessage}
      usersErrorMessage={
        usersRes.status === "success" ? "" : getApiResponseErrorMessage(usersRes, t("usersFailed"))
      }
      filters={filters}
    />
  )
}
