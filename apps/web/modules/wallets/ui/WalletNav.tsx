"use client"

import Link from "next/link"
import { Plane, Wallet } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { createContext, useContext, useEffect, useState } from "react"
import { Modal } from "@/shared/ui"
import { useT } from "@/shared/i18n/context"
import { loadMyGroups } from "../actions"
import { navTarget } from "../groups"
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

type WalletKindNavProps = {
  kind: WalletKind
  variant: "sidebar" | "bottom"
  /** 外殼的導覽樣式: 這個元件在模組裡, 拿不到外殼的 CSS。 */
  className: string
  activeClassName: string
  labelClassName?: string
  iconSize: number
}

/**
 * 導覽的「一般錢包」「旅遊錢包」(見 docs/features.md〈錢包列表〉): 只有一個群組能選時直接進去,
 * 兩個以上時手機從底部滑出面板、桌機在側欄展開成群組清單。
 */
export function WalletKindNav({
  kind, variant, className, activeClassName, labelClassName, iconSize,
}: WalletKindNavProps) {
  const t = useT(walletsMessages)
  const router = useRouter()
  const [picking, setPicking] = useState(false)
  const [toggled, setToggled] = useState<boolean | null>(null)
  const { label, Icon, active, target, choices } = useKindNav(kind)
  // 側欄: 所在的那一項預設展開, 點了再收合或展開。
  const expanded = variant === "sidebar" && choices.length > 0 && (toggled ?? active)

  function handleClick() {
    if (!target) router.push(walletsListPath("user", kind))
    else if ("go" in target) router.push(walletGroupPath(target.go))
    else if (variant === "bottom") setPicking(true)
    else setToggled(!expanded)
  }

  return (
    <>
      <button
        type="button" className={`${className} ${active ? activeClassName : ""}`}
        aria-expanded={variant === "sidebar" && choices.length > 0 ? expanded : undefined}
        onClick={handleClick}
      >
        <Icon size={iconSize} aria-hidden="true" />
        <span className={labelClassName}>{label}</span>
      </button>
      {expanded && <GroupLinks groups={choices} className={styles.navGroups} />}
      {variant === "bottom" && (
        <Modal title={t("pickGroup")} open={picking} onOpenChange={setPicking}>
          <GroupLinks groups={choices} className={styles.list} onPicked={() => setPicking(false)} />
        </Modal>
      )}
    </>
  )
}

/** 一種錢包在導覽上的狀態: 文字、圖示、是不是所在的那一項, 以及點了要去哪。 */
function useKindNav(kind: WalletKind) {
  const t = useT(walletsMessages)
  const nav = useContext(WalletNavContext)
  const target = nav?.groups ? navTarget(nav.groups, kind) : null
  return {
    label: kind === "travel" ? t("navTravel") : t("navGeneral"),
    Icon: kind === "travel" ? Plane : Wallet,
    active: nav?.activeKind === kind,
    target,
    choices: target && "pick" in target ? target.pick : [],
  }
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
