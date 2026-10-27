# 帳號、角色與密碼

誰能建立帳號、角色與權限怎麼分、後台開放給誰，以及忘記密碼時怎麼辦。為什麼開放一般使用者註冊見
[ADR 0009](../decisions/0009-public-signup.md)。

## 帳號

| 路徑 | 用途 |
|---|---|
| `make db superuser` | 超級管理者**只能**用 CLI 建立，網頁上沒有初始化畫面 |
| `/signup` | 一般使用者註冊，**任何人都可以註冊**，註冊完直接登入 |
| 後台「使用者管理」 | 超級管理者替別人建立帳號 |

- 超級管理者的第一個、第二個、唯一的超管失聯時的救援都走 `make db superuser`
  （見 [`operations.md`](../operations.md#建立超級管理者)）。能建立超管的前提是握有主機的 shell，
  不需要保管任何註冊代碼。
- 註冊的帳號自動綁上「一般用戶」系統角色，看不到管理後台。註冊時無法指定角色，請求內容帶了也不採用。
- 登入頁有前往註冊的按鈕，註冊頁也有回登入的按鈕。

**為什麼不做網頁初始化**：那種畫面在部署之後、有人完成之前是公開的，誰先進站誰就拿到全部權限。

## 角色與權限

系統角色只有兩個，由 seed 建立（有 `code`）：

| | 權限 | 怎麼取得 | 可以調整的 |
|---|---|---|---|
| 超級管理者（`super_admin`） | `*`，涵蓋所有操作與日後新增的權限 | 只能由 `make db superuser` 產生，**不能經由 API 指派** | 無 |
| 一般用戶（`user`） | 一開始是空的 | 註冊時自動綁上 | 權限（超管在角色頁調整） |

- 系統角色不能改名、不能停用：名稱由 seed 同步，畫面上依 `code` 查前端字典；停用了就沒有人註冊得進來，
  或超管本身失效。
- 一般用戶的權限只在第一次建立時由 seed 寫入，之後部署不會把超管調整過的權限蓋回去
  （`RoleTable.seed_insert_only_keys`）。
- 新建的使用者沒指定角色時沒有任何權限。

### 後台只開放給超級管理者

使用者與角色的管理（後台）只有超級管理者進得去：前端的 `admin/layout.tsx` 只看是不是
超級管理者，後端這些端點一律要求 `Permission.ALL`。角色上的權限是給**一般帳號**的業務功能用的，
沒有任何一個權限能打開後台。

一般帳號對自己帳號的操作集中在用戶設定（改暱稱、改密碼）與系統設定（語系），不需要任何權限。

即使是超級管理者也不能做的事：停用自己、停用超級管理者、指派超級管理者角色、把 `*` 放進一般角色
（含一般用戶）、修改超級管理者的權限、改名或停用系統角色。

## 密碼

- 記得舊密碼 → 自己在用戶設定改。
- 忘記密碼 → 請超級管理者在後台重設（超級管理者全部失聯時用 `make db superuser` 另建一個）。
  模板沒有 email，所以沒有寄重設連結。

改密碼會讓其他裝置登出，見 [Session](session.md#撤銷)。

## 程式與測試

- 建立超管：[`modules/users/superuser.py`](../../apps/api/modules/users/superuser.py)、
  [`test_superuser.py`](../../apps/api/tests/modules/users/test_superuser.py)
- 註冊與自己的帳號：[`modules/users/account.py`](../../apps/api/modules/users/account.py)、
  [`test_account.py`](../../apps/api/tests/modules/users/test_account.py)
- 系統角色與 seed：[`modules/roles/model.py`](../../apps/api/modules/roles/model.py)
- 後台的限制：[`modules/users/service.py`](../../apps/api/modules/users/service.py)、
  [`modules/roles/service.py`](../../apps/api/modules/roles/service.py)、
  前端 `apps/web/app/(protected)/admin/layout.tsx`
