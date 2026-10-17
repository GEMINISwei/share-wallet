# 變更紀錄

版本對應 `apps/api/app/config.py` 的 `APP_VERSION`。格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)。

## [Unreleased]

- 超級管理者只能用 `make db superuser` 建立，移除網頁上以 `REGISTER_KEY` 建立第一位超管的流程與
  `REGISTER_KEY` 設定（升級時可從 `.env` 刪掉），並移除不再使用的 `system_state` 資料表。
- `/signup` 改為公開註冊一般帳號，註冊完直接登入；帳號自動綁上 seed 建立的「一般用戶」系統角色。
- 「一般用戶」角色不能改名或停用，權限一開始是空的，可由超級管理者在角色頁調整，重啟不會被蓋回。

## [0.0.1]

- 初始專案：FastAPI + Next.js 全端模板，含認證、使用者與角色權限、中英雙語、Alembic migration。
