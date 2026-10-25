"use client"

import { useState } from "react"
import { Container, ErrorState, ListPageHeader, Notify, Surface, useNotify } from "@/shared/ui"
import type { ApiListMeta } from "@/shared/api/response"
import { useT } from "@/shared/i18n/context"
import { walletsMessages } from "../i18n"
import type { AdminWalletFilters, AdminWalletInfo, UserOption } from "../types"
import AdminCreateWalletDialog from "./AdminCreateWalletDialog"
import AdminWalletsFilterDialog from "./AdminWalletsFilterDialog"
import AdminWalletsTable from "./AdminWalletsTable"
import WalletAdminsDialog from "./WalletAdminsDialog"

type AdminWalletsViewProps = {
  wallets: AdminWalletInfo[]
  meta: ApiListMeta
  seq: number
  limit: number
  users: UserOption[]
  errorMessage: string
  usersErrorMessage: string
  filters: AdminWalletFilters
}

/**
 * 後台的錢包列表。只有建立與篩選兩個操作: 查看、設定、成員、分類與刪除都在錢包頁
 * (點名稱進去), 一個操作只放一個入口。
 */
export default function AdminWalletsView({
  wallets, meta, seq, limit, users, errorMessage, usersErrorMessage, filters,
}: AdminWalletsViewProps) {
  const t = useT(walletsMessages)
  const [creating, setCreating] = useState(false)
  const [filtering, setFiltering] = useState(false)
  const [showingAdmins, setShowingAdmins] = useState<AdminWalletInfo | null>(null)
  const { notify, notifyError, closeNotify } = useNotify()

  return (
    <Container size="lg" padded>
      <ListPageHeader
        title={t("adminHeading")}
        subtitle={t("adminSubtitle")}
        showReset={meta.hasPrevious}
        onFilter={() => setFiltering(true)}
        createAction={{ label: t("create"), onClick: () => setCreating(true) }}
      />

      {usersErrorMessage && (
        <Surface>
          <ErrorState>{usersErrorMessage}</ErrorState>
        </Surface>
      )}
      <AdminWalletsTable
        wallets={wallets} meta={meta} seq={seq} limit={limit} errorMessage={errorMessage}
        onShowAdmins={setShowingAdmins}
      />

      <AdminCreateWalletDialog
        open={creating} users={users} onClose={() => setCreating(false)} onError={notifyError}
      />
      <AdminWalletsFilterDialog
        key={filtering ? "filter-open" : "filter-closed"}
        open={filtering} onClose={() => setFiltering(false)} filters={filters}
      />
      <WalletAdminsDialog wallet={showingAdmins} onClose={() => setShowingAdmins(null)} />
      <Notify {...notify} onOpenChange={(open) => { if (!open) closeNotify() }} />
    </Container>
  )
}
