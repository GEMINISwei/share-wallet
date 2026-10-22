"use client"

import { useLocale, useT } from "@/shared/i18n/context"
import { loadMoreEntries } from "../actions"
import { entryRowText, signedAmount } from "../format"
import { walletsMessages } from "../i18n"
import type { EntryInfo, EntryPage } from "../types"
import Amount from "./Amount"
import DayGroups from "./DayGroups"
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
      <DayGroups
        items={items} getKey={(entry) => entry.id}
        renderItem={(entry) => <EntryRow entry={entry} onOpen={() => onOpen(entry)} />}
      />
      {hasMore && <LoadMoreButton isPending={isPending} failed={failed} onClick={loadMore} />}
    </>
  )
}

function EntryRow({ entry, onOpen }: { entry: EntryInfo; onOpen: () => void }) {
  const locale = useLocale()
  const { title, tag, detail } = entryRowText(entry, locale)
  // 日期在分組的標題上, 這裡不再重複。
  const meta = [detail, entry.created_by.nickname].filter(Boolean).join(" · ")
  return (
    <button type="button" className={`${styles.row} ${styles.rowButton}`} onClick={onOpen}>
      <span className={styles.rowMain}>
        <span className={styles.rowTitleLine}>
          <span className={styles.rowTitle}>{title}</span>
          {tag && <span className={styles.tag}>{tag}</span>}
        </span>
        <span className={styles.rowMeta}>{meta}</span>
      </span>
      <Amount value={signedAmount(entry.kind, entry.amount)} signed />
    </button>
  )
}
