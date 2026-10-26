"use client"

import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { ErrorState, ICON_SIZE, Loading, Modal } from "@/shared/ui"
import { getApiResponseErrorMessage } from "@/shared/api/error"
import { useT } from "@/shared/i18n/context"
import { loadMyGroups, loadMyWallets } from "../actions"
import { type AddEntryBlock, type AddEntryPickerItem, addEntryPickerGroups } from "../capabilities"
import { walletsMessages } from "../i18n"
import { addEntryPath, wantsAddEntry } from "../paths"
import Amount from "./Amount"
import { useGroupLabel } from "./useGroupLabel"
import styles from "./wallets.module.css"

/** 錢包頁交給底部導覽「＋」的記帳動作。被擋時照樣呼叫 `onAdd`, 由頁面說明原因。 */
type AddEntryRegistration = { onAdd: () => void; blocked: boolean }
type Register = (registration: AddEntryRegistration | null) => void

// 拆成兩個 context: 錢包頁只拿穩定的 register, 註冊後不會因為值變了又重新 render、再註冊一次。
const RegistrationContext = createContext<AddEntryRegistration | null>(null)
const RegisterContext = createContext<Register | null>(null)

const ADD_ENTRY_BLOCK_TEXT = {
  settling: "addBlockedSettling",
  settled: "addBlockedSettled",
  loadFailed: "addBlockedLoadFailed",
} as const satisfies Record<AddEntryBlock, string>

/** 包住外殼: 底部導覽的「＋」與頁面內容都要在裡面, 錢包頁才交得到記帳動作。 */
export function AddEntryProvider({ children }: { children: React.ReactNode }) {
  const [registration, setRegistration] = useState<AddEntryRegistration | null>(null)
  return (
    <RegisterContext.Provider value={setRegistration}>
      <RegistrationContext.Provider value={registration}>{children}</RegistrationContext.Provider>
    </RegisterContext.Provider>
  )
}

/** 錢包頁的「＋」: 可以記就開記一筆, 被擋就用通知說明原因。 */
export function useWalletAddEntry(
  block: AddEntryBlock | null, openAdd: () => void, notifyInfo: (message: string) => void,
) {
  const t = useT(walletsMessages)
  const onAdd = () => (block ? notifyInfo(t(ADD_ENTRY_BLOCK_TEXT[block])) : openAdd())
  useAddEntryNav(onAdd, block !== null)
}

/** 錢包頁把記一筆交給「＋」; 離開頁面時收回, 「＋」改回選錢包。外殼沒有「＋」時不做事。 */
function useAddEntryNav(onAdd: () => void, blocked: boolean) {
  const register = useContext(RegisterContext)
  const onAddRef = useRef(onAdd)
  useEffect(() => { onAddRef.current = onAdd }, [onAdd])
  useEffect(() => {
    if (!register) return
    register({ onAdd: () => onAddRef.current(), blocked })
    return () => register(null)
  }, [register, blocked])
}

/**
 * 從選錢包面板進來 (`?add=1`) 時, 進頁面後馬上開記一筆。
 * 等掛上之後才開: 對話框要掛到 `document.body`, 伺服器端 render 時沒有。
 * 參數要用 Next 的 router 拿掉: 直接改 history 會在 router 初始化時被蓋回原本的網址,
 * 之後重新整理就會再開一次。
 */
export function useAddEntryFromUrl(openAdd: () => void, allowed: boolean) {
  const router = useRouter()
  const openAddRef = useRef(openAdd)
  const allowedRef = useRef(allowed)
  useEffect(() => {
    openAddRef.current = openAdd
    allowedRef.current = allowed
  }, [openAdd, allowed])
  useEffect(() => {
    if (!wantsAddEntry(new URLSearchParams(window.location.search).get("add"))) return
    router.replace(window.location.pathname, { scroll: false })
    if (allowedRef.current) openAddRef.current()
  }, [router])
}

type PickerState =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "ready"; groups: ReturnType<typeof addEntryPickerGroups> }

/** 底部導覽中間的「＋」: 在錢包頁直接記到這個錢包, 其他頁先選錢包。 */
export function AddEntryNavButton() {
  const t = useT(walletsMessages)
  const registration = useContext(RegistrationContext)
  const [picking, setPicking] = useState(false)
  const picker = usePickerWallets()

  function openPicker() {
    setPicking(true)
    picker.refresh()
  }

  const blocked = registration?.blocked ?? false
  return (
    <>
      <button
        type="button"
        className={`${styles.navAdd} ${blocked ? styles.navAddBlocked : ""}`}
        aria-label={t("addEntry")}
        aria-disabled={blocked || undefined}
        onClick={registration ? registration.onAdd : openPicker}
      >
        <span className={styles.navAddCircle}><Plus size={ICON_SIZE.lg} /></span>
      </button>
      <Modal title={t("pickWallet")} open={picking} onOpenChange={setPicking}>
        <PickerBody state={picker.state} onPicked={() => setPicking(false)} />
      </Modal>
    </>
  )
}

/**
 * 選錢包面板的資料 (錢包與自己的群組)。外殼掛上時就先取一次: 點了才取的話面板會先出現載入中再換成列表,
 * 有一段停頓, 高度也會跟著縮。打開時再背景更新, 期間沿用手上的列表, 不退回載入中。
 */
function usePickerWallets() {
  const t = useT(walletsMessages)
  const [state, setState] = useState<PickerState>({ status: "loading" })
  const refresh = useCallback(() => {
    void Promise.all([loadMyWallets(), loadMyGroups()]).then(([wallets, groups]) => setState(
      (current) => {
        if (wallets.status === "success" && groups.status === "success") {
          const sections = addEntryPickerGroups(wallets.data.list_data, groups.data.list_data)
          return { status: "ready", groups: sections }
        }
        if (current.status === "ready") return current
        const failed = wallets.status === "success" ? groups : wallets
        return { status: "failed", message: getApiResponseErrorMessage(failed, t("pickWalletFailed")) }
      },
    ))
  }, [t])
  useEffect(() => { refresh() }, [refresh])
  return { state, refresh }
}

function PickerBody({ state, onPicked }: { state: PickerState; onPicked: () => void }) {
  const t = useT(walletsMessages)
  const groupLabel = useGroupLabel()
  if (state.status === "loading") return <Loading />
  if (state.status === "failed") return <ErrorState>{state.message}</ErrorState>
  if (state.groups.length === 0) {
    return <p className={styles.hint}>{t("pickWalletEmpty")}</p>
  }
  return (
    <div className={styles.picker}>
      {state.groups.map(({ group, items }) => (
        <PickerGroup key={group.id} label={groupLabel(group)} items={items} onPicked={onPicked} />
      ))}
    </div>
  )
}

type PickerGroupProps = { label: string; items: AddEntryPickerItem[]; onPicked: () => void }

function PickerGroup({ label, items, onPicked }: PickerGroupProps) {
  const t = useT(walletsMessages)
  const router = useRouter()
  if (items.length === 0) return null
  return (
    <section>
      <h3 className={styles.sectionTitle}>{label}</h3>
      <ul className={styles.list}>
        {items.map(({ wallet, block }) => (
          <li key={wallet.id}>
            <button
              type="button" className={styles.pickerItem} disabled={block !== null}
              onClick={() => { onPicked(); router.push(addEntryPath(wallet.id)) }}
            >
              <span className={styles.rowTitle}>{wallet.name}</span>
              {block && <span className={styles.rowMeta}>{t(ADD_ENTRY_BLOCK_TEXT[block])}</span>}
              {!block && wallet.balance !== null && (
                <Amount value={wallet.balance} className={styles.rowMeta} />
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
