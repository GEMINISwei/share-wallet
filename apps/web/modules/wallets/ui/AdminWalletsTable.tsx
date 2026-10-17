"use client"

import Link from "next/link"
import { ErrorState, ListTableCard, Pagination, Surface, TableRow } from "@/shared/ui"
import type { ApiListMeta } from "@/shared/api/response"
import { useT } from "@/shared/i18n/context"
import { adminsSummary } from "../capabilities"
import { walletsMessages } from "../i18n"
import { walletPath } from "../paths"
import type { AdminWalletInfo } from "../types"
import Amount from "./Amount"
import LocalDate from "./LocalDate"
import styles from "./wallets.module.css"

type AdminWalletsTableProps = {
  wallets: AdminWalletInfo[]
  meta: ApiListMeta
  seq: number
  limit: number
  errorMessage: string
  onShowAdmins: (wallet: AdminWalletInfo) => void
}

export default function AdminWalletsTable({
  wallets, meta, seq, limit, errorMessage, onShowAdmins,
}: AdminWalletsTableProps) {
  const t = useT(walletsMessages)

  if (errorMessage) {
    return (
      <Surface>
        <ErrorState>{errorMessage}</ErrorState>
      </Surface>
    )
  }

  return (
    <>
      <ListTableCard
        headers={[t("colName"), t("colAdmins"), t("colMembers"), t("colBalance"), t("colCreatedAt")]}
        isEmpty={wallets.length === 0}
        emptyText={t("adminEmpty")}
      >
        {wallets.map((wallet) => (
          <AdminWalletRow
            key={wallet.id} wallet={wallet} onShowAdmins={() => onShowAdmins(wallet)}
          />
        ))}
      </ListTableCard>
      <Pagination
        meta={meta} seq={seq} limit={limit}
        summary={t("adminSummary", { count: meta.totalCount ?? 0 })}
      />
    </>
  )
}

function AdminWalletRow({
  wallet, onShowAdmins,
}: { wallet: AdminWalletInfo; onShowAdmins: () => void }) {
  const t = useT(walletsMessages)
  const admins = adminsSummary(wallet.admins)
  const kind = wallet.kind === "travel"
    ? `${t("kindTravel")} · ${wallet.destination}`
    : t("kindGeneral")
  const adminsLabel = admins.count > 1
    ? t("adminsMore", { name: admins.first, count: admins.count, more: admins.more })
    : admins.first

  return (
    <TableRow>
      <td data-label={t("colName")}>
        <span className={styles.rowMain}>
          <Link href={walletPath(wallet.id, "admin")} className={styles.tableLink}>
            {wallet.name}
          </Link>
          <span className={styles.rowMeta}>{kind}</span>
        </span>
      </td>
      <td data-label={t("colAdmins")}>
        {admins.count === 0
          ? t("noAdmins")
          : <button type="button" className={styles.tableLink} onClick={onShowAdmins}>{adminsLabel}</button>}
      </td>
      <td data-label={t("colMembers")}>{wallet.member_count}</td>
      <td data-label={t("colBalance")}>
        {wallet.balance === null ? "—" : <Amount value={wallet.balance} />}
      </td>
      <td data-label={t("colCreatedAt")}><LocalDate iso={wallet.created_at} /></td>
    </TableRow>
  )
}
