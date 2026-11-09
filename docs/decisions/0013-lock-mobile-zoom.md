# 0013. 手機上鎖住畫面縮放

狀態：採用（2026-11-09）

## 背景

主流建議是不要鎖縮放：WCAG 1.4.4 要求文字能放大到 200%，Lighthouse 也會把 `user-scalable=no` 與
`maximum-scale` 小於 5 標成無障礙問題。原生 App 不提供縮放，改由系統字級設定把文字放大。

Share Wallet 主要在手機上記帳，要盡量像原生 App。可以縮放時，雙指、雙擊或點輸入框都可能讓畫面放大，
固定的標題列、底部導覽與對話框跟著跑掉，使用者還得自己縮回來。

## 決定

在手機上鎖住縮放，分兩處擋：

- 雙指縮放與點輸入框自動放大：viewport 設 `maximum-scale=1`、`user-scalable=no`（`app/layout.tsx`）。
- 雙擊放大：根元素 `touch-action: manipulation`（`shared/ui/styles/base.css`）。viewport 只管雙指，
  雙擊要另外擋；點擊也因此不用再等雙擊判定的延遲。

不另外把觸控裝置上的輸入框字級拉到 16px：輸入框維持跟其他文字一樣的字級，畫面比較一致。
也不用 JS 攔 `gesturestart`／`touchmove` 去擋 iOS Safari 分頁裡的雙指縮放：容易誤擋捲動，iOS 改版也可能失效。

## 後果

- 加到主畫面以全螢幕開啟、或在 Android 上，畫面不會縮放，手感接近原生 App。
- iOS Safari 分頁會忽略 `user-scalable`：仍可雙指縮放，點到字級小於 16px 的輸入框時也可能自動放大。
  這是瀏覽器刻意保留的，不另外處理；遇到時再考慮觸控裝置上把輸入框字級拉到 16px。
- 視力不好的人不能用縮放放大畫面，Lighthouse 的無障礙分數會被扣。Android Chrome 會依系統字級放大文字
  （字級都用 `rem`），iOS 目前沒有跟隨「動態字體」，要用 `font: -apple-system-body` 另外接。
- 使用者包含需要放大畫面的族群、或要符合無障礙規範時，拿掉 viewport 的 `maximum-scale` 與
  `user-scalable` 恢復縮放；`touch-action` 可以保留。
