"use client"

import Link from "next/link"
import { Wallet } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { createContext, useContext, useEffect, useState } from "react"
import { Modal } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { loadMyGroups } from "../actions"
import { type NavSection, navSections } from "../groups"
import { walletsMessages } from "../i18n"
import { walletGroupPath, walletsListPath } from "../paths"
import type { WalletGroupInfo, WalletKind } from "../types"
import Amount from "./Amount"
import { useGroupLabel } from "./useGroupLabel"
import styles from "./wallets.module.css"

type WalletNavState = {
  /** 還沒載入或載入失敗時是 null, 點了就交給 `/wallets` 決定去哪。 */
  groups: WalletGroupInfo[] | null
  /** 目前這一頁屬於哪種錢包 (群組頁、錢包頁), 導覽據此標出所在的那一項。 */
  activeKind: WalletKind | null
  setActiveKind: (kind: WalletKind | null) => void
}

const WalletNavContext = createContext<WalletNavState | null>(null)

/**
 * 包住外殼: 導覽的「一般錢包」「旅遊錢包」與頁面都要在裡面。群組在換頁時重新取一次:
 * 錢包設定改了群組、錢包設為不顯示之後, 導覽的清單跟著變。
 */
export function WalletNavProvider({ children }: { children: React.ReactNode }) {
  const [groups, setGroups] = useState<WalletGroupInfo[] | null>(null)
  const [activeKind, setActiveKind] = useState<WalletKind | null>(null)
  const pathname = usePathname()
  useEffect(() => {
    void loadMyGroups().then((res) => {
      if (res.status === "success") setGroups(res.data.list_data)
    })
  }, [pathname])
  return (
    <WalletNavContext.Provider value={{ groups, activeKind, setActiveKind }}>
      {children}
    </WalletNavContext.Provider>
  )
}

/** 群組頁與錢包頁告訴導覽自己屬於哪種錢包; 離開頁面時收回。外殼沒有導覽時不做事。 */
export function useActiveWalletKind(kind: WalletKind | null) {
  const setActiveKind = useContext(WalletNavContext)?.setActiveKind
  useEffect(() => {
    if (!setActiveKind) return
    setActiveKind(kind)
    return () => setActiveKind(null)
  }, [setActiveKind, kind])
}

type WalletNavItemProps = {
  variant: "sidebar" | "bottom"
  /** 外殼的導覽樣式: 這個元件在模組裡, 拿不到外殼的 CSS。 */
  className: string
  activeClassName: string
  labelClassName?: string
  iconSize: number
}

/**
 * 導覽的「錢包」(見 docs/features/wallets.md〈錢包列表〉): 一般、旅遊合成一項, 點了之後手機從底部
 * 滑出面板、桌機在側欄展開, 兩種各一段列出能選的群組。
 */
export function WalletNavItem({
  variant, className, activeClassName, labelClassName, iconSize,
}: WalletNavItemProps) {
  const t = useT(walletsMessages)
  const router = useRouter()
  const nav = useContext(WalletNavContext)
  const [picking, setPicking] = useState(false)
  const [toggled, setToggled] = useState<boolean | null>(null)
  // 一個錢包都沒有 (例如剛註冊) 時沒有群組可選, 跟還沒載入一樣直接交給 `/wallets`。
  const choices = nav?.groups ? navSections(nav.groups) : []
  const sections = choices.length > 0 ? choices : null
  const active = Boolean(nav?.activeKind)
  // 側欄: 在群組頁或錢包頁時預設展開, 點了再收合或展開。
  const expanded = variant === "sidebar" && sections !== null && (toggled ?? active)

  function handleClick() {
    if (!sections) router.push(walletsListPath("user"))
    else if (variant === "bottom") setPicking(true)
    else setToggled(!expanded)
  }

  return (
    <>
      <button
        type="button" className={`${className} ${active ? activeClassName : ""}`}
        aria-expanded={variant === "sidebar" && sections ? expanded : undefined}
        onClick={handleClick}
      >
        <Wallet size={iconSize} aria-hidden="true" />
        <span className={labelClassName}>{t("navWallets")}</span>
      </button>
      {expanded && sections && <NavSections sections={sections} variant="sidebar" />}
      {variant === "bottom" && (
        <Modal title={t("pickGroup")} open={picking} onOpenChange={setPicking}>
          <NavSections sections={sections ?? []} variant="bottom" onPicked={() => setPicking(false)} />
        </Modal>
      )}
    </>
  )
}

type NavSectionsProps = {
  sections: NavSection[]
  variant: "sidebar" | "bottom"
  onPicked?: () => void
}

function NavSections({ sections, variant, onPicked }: NavSectionsProps) {
  const t = useT(walletsMessages)
  const sidebar = variant === "sidebar"
  return (
    <div className={sidebar ? styles.navSections : styles.content}>
      {sections.map(({ kind, groups }) => {
        const titleId = `wallet-nav-${variant}-${kind}`
        return (
          <div key={kind} role="group" aria-labelledby={titleId}>
            <span id={titleId} className={styles.navSectionTitle}>
              {kind === "travel" ? t("navTravel") : t("navGeneral")}
            </span>
            <GroupLinks
              groups={groups} className={sidebar ? styles.navGroups : styles.list}
              onPicked={onPicked}
            />
          </div>
        )
      })}
    </div>
  )
}

type GroupLinksProps = { groups: WalletGroupInfo[]; className: string; onPicked?: () => void }

function GroupLinks({ groups, className, onPicked }: GroupLinksProps) {
  const pathname = usePathname()
  const groupLabel = useGroupLabel()
  return (
    <ul className={className}>
      {groups.map((group) => {
        const href = walletGroupPath(group.id)
        return (
          <li key={group.id}>
            <Link
              href={href} prefetch={false} onClick={onPicked}
              className={`${styles.pickerItem} ${pathname === href ? styles.navGroupActive : ""}`}
              aria-current={pathname === href ? "page" : undefined}
            >
              <span className={styles.rowTitle}>{groupLabel(group)}</span>
              {group.total_balance !== null && (
                <Amount value={group.total_balance} className={styles.rowMeta} />
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
