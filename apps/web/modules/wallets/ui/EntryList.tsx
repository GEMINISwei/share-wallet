"use client"

import { useLocale, useT } from "@/shared/i18n/context"
import { loadMoreEntries } from "../actions"
import { entryTitle, formatEntryDate, signedAmount } from "../format"
import { walletsMessages } from "../i18n"
import type { EntryInfo, EntryPage } from "../types"
import Amount from "./Amount"
import LoadMoreButton from "./LoadMoreButton"
import { useLoadMore } from "./useLoadMore"
import styles from "./wallets.module.css"

type EntryListProps = {
  walletId: string
  firstPage: EntryPage
  onOpen: (entry: EntryInfo) => void
}

export default function EntryList({ walletId, firstPage, onOpen }: EntryListProps) {
  const t = useT(walletsMessages)
  const { items, hasMore, isPending, failed, loadMore } = useLoadMore(
    firstPage, (cursor) => loadMoreEntries(walletId, cursor),
  )

  if (items.length === 0) return <p className={styles.hint}>{t("noEntries")}</p>
  return (
    <>
      <ul className={styles.list}>
        {items.map((entry) => (
          <li key={entry.id}>
            <EntryRow entry={entry} onOpen={() => onOpen(entry)} />
          </li>
        ))}
      </ul>
      {hasMore && <LoadMoreButton isPending={isPending} failed={failed} onClick={loadMore} />}
    </>
  )
}

function EntryRow({ entry, onOpen }: { entry: EntryInfo; onOpen: () => void }) {
  const locale = useLocale()
  const meta = [formatEntryDate(entry.entry_date, locale), entry.created_by.nickname, entry.note]
    .filter(Boolean).join(" · ")
  return (
    <button type="button" className={`${styles.row} ${styles.rowButton}`} onClick={onOpen}>
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{entryTitle(entry, locale)}</span>
        <span className={styles.rowMeta}>{meta}</span>
      </span>
      <Amount value={signedAmount(entry.kind, entry.amount)} />
    </button>
  )
}
