# 通知

哪些事件推播給誰。

以推播通知，原則是只推「要你做點什麼」或「與你直接相關」的事。**一般記帳不推播**。

| 事件 | 通知對象 |
|---|---|
| 旅遊錢包開始結算 | 所有成員，內容是自己要付給誰、或誰會付給自己 |
| 旅遊錢包取消結算 | 所有成員 |
| 付款人標記「我已付款」 | 收款人 |
| 收款被確認 | 付款人 |
| 結帳完成、錢包封存 | 所有成員 |
| 自己記的帳被別人修改或刪除 | 原記帳人 |
| 有人透過邀請連結加入 | 該錢包的管理者 |
| 被升為管理者、被移出錢包 | 當事人 |

iPhone 必須把網站加到主畫面才收得到推播，這是 iOS 的限制。

## 程式與測試

推播還在規劃中，還沒有實作。下面是觸發通知的事件目前所在的位置，實作推播時從這裡接上：

- 結算、付款、確認收款、結帳完成：[`settlement.py`](../../apps/api/modules/wallets/settlement.py)、[`test_settlement.py`](../../apps/api/tests/modules/wallets/test_settlement.py)
- 帳目被別人修改或刪除：一般錢包 [`entries.py`](../../apps/api/modules/wallets/entries.py)、[`test_entries.py`](../../apps/api/tests/modules/wallets/test_entries.py)；旅遊錢包 [`expenses.py`](../../apps/api/modules/wallets/expenses.py)、[`test_expenses.py`](../../apps/api/tests/modules/wallets/test_expenses.py)
- 透過邀請加入：[`invites.py`](../../apps/api/modules/wallets/invites.py)、[`test_invites.py`](../../apps/api/tests/modules/wallets/test_invites.py)
- 升為管理者、移出錢包：[`members.py`](../../apps/api/modules/wallets/members.py)、[`test_members.py`](../../apps/api/tests/modules/wallets/test_members.py)
- 推播的文字跟錯誤訊息一樣走 `LangText` + `resolve_text()`：[`errors.py`](../../apps/api/shared/http/errors.py)、[`test_errors.py`](../../apps/api/tests/shared/http/test_errors.py)
