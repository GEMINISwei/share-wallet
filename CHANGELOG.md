# 變更紀錄

版本對應 `apps/api/app/config.py` 的 `APP_VERSION`。格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)。

## [Unreleased]

- 新增錢包（`/wallets`，首頁直接導過去）：一般錢包與旅遊錢包的建立、設定與刪除，列表顯示一般錢包的
  餘額總和。成員可以升降管理者、移出成員或自己離開，錢包至少要有一位管理者。一般錢包有收入與支出
  分類，建立時依語系附上預設分類，刪除分類是封存。使用錢包不需要任何全站權限，超級管理者對任何錢包
  等同管理者。產品規則寫在 `docs/features.md`。
- 超級管理者只能用 `make db superuser` 建立，移除網頁上以 `REGISTER_KEY` 建立第一位超管的流程與
  `REGISTER_KEY` 設定。
- `/signup` 改為公開註冊一般帳號，註冊完直接登入；帳號自動綁上 seed 建立的「一般用戶」系統角色。
- 「一般用戶」角色不能改名或停用，權限一開始是空的，可由超級管理者在角色頁調整，重啟不會被蓋回。

## [0.0.1]

- 初始專案：FastAPI + Next.js 全端模板，含認證、使用者與角色權限、中英雙語、Alembic migration。
