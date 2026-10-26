/**
 * wallets 的 Client 公開面 (不含 server-only)。
 *
 * 登入、註冊頁收到 `?invite=` 時, 要驗證 token 並在完成後導到確認頁, 規則只在這裡一份。
 */

export { invitePath, parseInviteToken, withInvite } from "./invite-link"

/** 外殼的底部導覽: 中間的「＋」記一筆, 錢包頁透過 provider 把記帳動作交給它。 */
export { AddEntryNavButton, AddEntryProvider } from "./ui/AddEntryNav"

/** 外殼導覽的「一般錢包」「旅遊錢包」: 依自己的錢包群組選群組進去。 */
export { WalletKindNav, WalletNavProvider } from "./ui/WalletNav"
