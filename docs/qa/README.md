# 探索式 QA 總覽

這一輪 QA 由 AI Agent 扮演六種使用者，直接操作建置後的正式版本，不是用單元測試。每個角色一份紀錄，Bug 統一記在 [bugs.md](bugs.md)。

## 怎麼測的

- 程式：PR-14 分支加上 PR-13、PR-14 最新 commit（`8f10368`），`npm run build` 後用 `npm start` 啟動。
- 設定：`PORT=3200`、`ADMIN_TOKEN=qa-admin`、`LOG_DB_PATH` 指到暫存資料夾、`PUBLIC_BASE_URL=http://127.0.0.1:3200`。
- 瀏覽器：Playwright 的 Chromium。主持人用 1920×1080，玩家用 iPhone 13 模擬（390×664，`deviceScaleFactor: 1`）。
- 偽造事件與猜 Token 用 Node 的 `socket.io-client`，直接連 WebSocket。
- 查證：每一步的結果除了看畫面，也直接讀 SQLite 的 Event Log（例如「連點加入」是否真的只寫入一筆 `PLAYER_JOINED`）。

## 證據在哪裡

- 腳本、原始輸出、截圖都放在執行者本機的 `C:/dev/wd-worktrees/pr-15-evidence/`，沒有提交進 repo：
  - `qa-scripts/`：每個角色一支 Playwright / Node 腳本（`role1-newbie.mjs` 到 `role6-host.mjs`，以及 `role2b`、`role4b`、`role4c`、`role5b` 補測）。
  - `qa/<角色>/results.log`：腳本逐項記下的 `OK` / `FAIL` 與當時的畫面文字。
  - `qa/<角色>/*.png`：截圖。
  - `qa/server.log`、`qa/db/events.db`：Server 輸出與 Event Log。
- 只有幾張會用到的小截圖放進 `docs/qa/img/`。
- 各份報告的「Game ID」可用 `GET /admin/games/<gameId>/events` 或 `npm run logs -- --game <gameId>` 查（見 [event-log.md](../event-log.md)。連線、加入、離開的事件沒有 Game ID，要用房間 ID 查）。

## 怎麼讀結果

- 報告裡的「OK」是腳本當下的觀察，不是代表沒有問題。「FAIL」有兩種：一種是真的 Bug（列進 bugs.md），另一種是腳本的預期寫錯（報告裡會註明，例如把「斷線後 1 毫秒就看不到離線標籤」當成失敗）。
- 沒有跑的東西不寫。真機、iOS Safari、Android Chrome、投影都沒測，見 [manual-test-checklist.md](../manual-test-checklist.md)。

## 六份報告

| 角色                   | 報告                                         | 結論                                                                                                                     |
| ---------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 第一次玩的新手         | [01-new-player.md](01-new-player.md)         | 流程走得通，2 個 P3（沒有輸入房間代碼的入口、題目卡沒說明怎麼玩）                                                        |
| 重複點擊的玩家         | [02-repeat-clicker.md](02-repeat-clicker.md) | 真實連點全部正確；程式內同步連點 6 次會建出 6 個房間（P3）                                                               |
| 不斷重新整理的玩家     | [03-refresher.md](03-refresher.md)           | 各 phase 重新整理都能接回，題目重整後會重新隱藏                                                                          |
| 中途斷線重連的玩家     | [04-reconnect.md](04-reconnect.md)           | 斷線期間被淘汰能正確補上；網路無聲中斷時畫面最久停 45 秒（P2，已修，現在最久 20 秒）                                     |
| 想偷看別人題目的玩家   | [05-peeker.md](05-peeker.md)                 | 沒有找到偷看別人詞語或身分的方法；2 個 P3（無 IP 限流、`X-Powered-By`）                                                  |
| 操作主持人介面的使用者 | [06-host-ui.md](06-host-ui.md)               | 連點、錯 phase、雙分頁都被擋住；換瀏覽器開主持人網址的訊息有誤導（P3）；首頁在連線完成前按「建立房間」會出錯誤提示（P2） |

共 9 筆問題：2 筆 P2、7 筆 P3，見 [bugs.md](bugs.md)。兩筆 P2（QA-01、QA-09）已由修復 PR 修好。**P0、P1：沒有找到。**

整個 QA 期間 Event Log 沒有 `SERVER_ERROR`，Server 輸出沒有任何 error 行。
