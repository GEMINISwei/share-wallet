"use client"

import { useSyncExternalStore } from "react"
import { useLocale } from "@/shared/i18n/context"
import { dayLabel, formatEntryDate, groupByDay, localToday } from "../format"
import styles from "./wallets.module.css"

const subscribe = () => () => {}

/**
 * 「今天」「昨天」要看瀏覽器的日期: 伺服器 render 時先顯示日期, hydration 之後才換成相對的說法,
 * 理由同 `LocalDate`。
 */
function DayHeading({ day }: { day: string }) {
  const locale = useLocale()
  const text = useSyncExternalStore(
    subscribe,
    () => dayLabel(day, localToday(), locale),
    () => formatEntryDate(day, locale),
  )
  return <h3 className={styles.dayHeading}><time dateTime={day}>{text}</time></h3>
}

type DayGroupsProps<T> = {
  items: readonly T[]
  getKey: (item: T) => string
  renderItem: (item: T) => React.ReactNode
}

/** 帳目依日期分組, 每組一張卡片; 一般與旅遊錢包的帳目列表共用。 */
export default function DayGroups<T extends { entry_date: string }>(
  { items, getKey, renderItem }: DayGroupsProps<T>,
) {
  return (
    <div className={styles.dayGroups}>
      {groupByDay(items).map((group) => (
        <section key={group.day}>
          <DayHeading day={group.day} />
          <ul className={styles.list}>
            {group.items.map((item) => <li key={getKey(item)}>{renderItem(item)}</li>)}
          </ul>
        </section>
      ))}
    </div>
  )
}
