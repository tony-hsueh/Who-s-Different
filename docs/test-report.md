# 測試報告

這份報告的數字都來自這一票實際跑過的指令（Windows 10 開發機，Node 24.22.1，16 邏輯核心）。原始輸出在執行者本機的 `C:/dev/wd-worktrees/pr-15-evidence/`，沒有提交進 repo。

程式版本：PR-14 分支（`8f10368`，含 PR-04 到 PR-12、PR-13、PR-14 的 21 情境 E2E）。這一票只加文件、`Dockerfile`、`.dockerignore`，沒有改程式，所以測試結果等同於該版本。

## QA-01、QA-09 修復後的數字

修復 PR 在 PR-15 的程式上加了修正與測試（證據在執行者本機的 `C:/dev/wd-worktrees/fix-connection-evidence/`）。下面的總表與各節仍是 PR-15 當時的結果，這一節是修復後重跑的數字：

| 項目                                                 | 結果                                                                                                                                        | 紀錄                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `npm run lint`、`npm run typecheck`、`npm run build` | 全部通過                                                                                                                                    | `lint.log`、`typecheck.log`、`build.log` |
| `npx vitest run`                                     | **488 個測試全部通過**，39 個檔案（PR-15 是 469 個、35 個檔案；新增 19 個：心跳選項 2、重連與喚醒 7、`ServerButton` 6、首頁 2、加入表單 2） | `vitest.log`                             |
| `npx playwright test`（預設 8 個 worker），第 1 次   | **72 個全部通過**，40.0 秒（新增 5 個，在 `e2e/connection.spec.ts`）                                                                        | `e2e.log`                                |
| `npx playwright test`（預設 8 個 worker），第 2 次   | **72 個全部通過**，41.0 秒                                                                                                                  | `e2e-run2.log`                           |

修復前，預設 worker 數的完整套件連續兩次各有一個測試在建立房間時失敗（下面「本機預設 worker 數會偶爾失敗」）。修復後連續兩次都沒有失敗，因為連線前按鈕的名稱是「連線中…」，E2E 用「建立房間」找按鈕時會等到它出現且可按。

QA 腳本修復前後的比較（同一支 `role4b-silent-drop.mjs`、`role6b-click-before-connected.mjs`）：

| 量測                                        | 修復前                 | 修復後                               |
| ------------------------------------------- | ---------------------- | ------------------------------------ |
| 無聲中斷，手機出現「連線中…」               | 45.0 秒                | 19.9 秒（兩次）                      |
| 無聲中斷，手機補上淘汰或結果                | 45.5 秒                | 20.4 秒（兩次）                      |
| 無聲中斷後 2 秒觸發 `online` 事件，補上狀態 | 沒有這個機制           | 約 4 秒（事件後）                    |
| 連線前按「建立房間」                        | 停在首頁並跳出錯誤提示 | 按鈕停用，等連上才建立，沒有錯誤提示 |

## 總表

| 項目                                      | 結果                                                             | 紀錄                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `npm run lint`                            | 通過（ESLint 與 Prettier）                                       | `lint.log`                                                             |
| `npm run typecheck`                       | 通過                                                             | `typecheck.log`                                                        |
| `npx vitest run`                          | **469 個測試全部通過**，35 個檔案，8.2 秒                        | `vitest.log`                                                           |
| `npm run build`                           | 通過                                                             | `build.log`                                                            |
| `npx playwright test --workers=2`         | **67 個測試全部通過**，45.8 秒                                   | `e2e.log`                                                              |
| `npx playwright test`（預設 8 個 worker） | **失敗 1 個，連續兩次**，其餘 66 個通過（見下面）                | `e2e-default-workers-run2.log`（第 1 次的紀錄被覆蓋）                  |
| 探索式 QA                                 | 6 個角色、9 筆問題（0 個 P0、0 個 P1、2 個 P2、7 個 P3）         | [qa/README.md](qa/README.md)、[qa/bugs.md](qa/bugs.md)                 |
| Docker 映像檔                             | 建置成功，容器內 `/healthz` 回 `{"ok":true}`，健康檢查 `healthy` | `docker-build.log`、`docker-check.log`                                 |
| PR-14 的 CI                               | 5 次嘗試全部綠燈                                                 | https://github.com/tony-hsueh/Who-s-Different/actions/runs/43679607787 |
| 真機與投影                                | **沒有測**                                                       | [manual-test-checklist.md](manual-test-checklist.md)（待執行）         |

## Unit 與整合測試（Vitest）

兩個 project：`server`（node 環境，含 `tests/integration/`）與 `client`（jsdom）。

| Project | 測試數 |
| ------- | ------ |
| server  | 297    |
| client  | 172    |
| 合計    | 469    |

涵蓋的範圍：

- **遊戲規則**（`rules.test.ts`，56 個）：人數與少數人數、淘汰、跳過、勝負、狀態不被修改、固定 seed 可重現。
- **房間與身分**（`room-store.test.ts`、`sessions.test.ts`、`projections.test.ts`）：加入與離開規則、Token 只存雜湊與過期、公開與私人狀態不含秘密。
- **Socket.IO 協定**（`tests/integration/`：`auth`、`game-flow`、`robustness`、`reconnect`、`logging`）：身分綁定、權限、冪等、限流、重連、Event Log 順序與去識別化。
- **Event Log**（`logger.test.ts`、`redact.test.ts`、`admin/routes.test.ts`、`config.test.ts`）：寫入、redact、清理、管理端點的 401 與 404。
- **前端**（`PlayerPage`、`HostPlaying`、`HostReveal`、`HostLobby`、`connection`…）：題目卡隱藏與自動隱藏、淘汰確認與過時視窗、連線層重連與逾時、路由。
- **視覺**（`contrast.test.ts`）：淺色與深色的文字對比。

## 端對端（Playwright）

用真的 Chromium，主持人 1920×1080，玩家 iPhone 13 視窗。`playwright.config.ts` 先建置再啟動正式版 Server（連接埠 3100），所有測試共用一個 Server、各用獨立房間。總共 67 個測試，涵蓋票上的 21 個多人情境：

| 檔案                                                | 內容                                                                                    |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `start.spec.ts`                                     | 4、8、10、15 人開始遊戲，每支手機拿到詞；3 人不能開始                                   |
| `join.spec.ts`                                      | 第 16 位玩家加不進滿的房間                                                              |
| `lobby.spec.ts`                                     | QR Code 不含 Token、玩家即時出現、15 人不捲動                                           |
| `player-card.spec.ts`                               | 題目卡隱藏／顯示、背景自動隱藏、重新整理保持座位、淘汰後仍可看題目、每個控制項至少 44px |
| `eliminate.spec.ts`                                 | 點頭像要確認、連點確認只淘汰一次、已淘汰不能再選、主持人畫面沒有存活玩家的詞或陣營      |
| `rounds.spec.ts`                                    | 錯抓與抓對的揭曉、下一輪、跳過、兩種勝負、完整一場、減少動態                            |
| `secrecy.spec.ts`                                   | 記錄所有 WebSocket 封包，檢查沒有活著的玩家的詞與陣營                                   |
| `reconnect.spec.ts`                                 | 重新整理回到同一個人、斷線不影響存活、斷線恢復後頭像與題目、舊分頁關閉不會讓人離線      |
| `reset.spec.ts`                                     | 再玩一場回到 Lobby 並換題                                                               |
| `event-log.spec.ts`                                 | 每場遊戲都能用 Game ID 查到 Log                                                         |
| `layout.spec.ts`、`visual.spec.ts`、`smoke.spec.ts` | 版面不橫向捲動、CSP 不擋 App、深色模式、`/healthz`、Socket.IO 同源                      |

### 本機預設 worker 數會偶爾失敗（已由修復 PR 解決）

以下是 PR-15 當時的紀錄，原因 QA-09 已修，修復後預設 worker 數連續兩次全過（見上一節）。

這台機器有 16 個邏輯核心，Playwright 預設開 8 個 worker。用預設值跑完整套件，**連續兩次各有一個測試失敗**：

1. `player-card.spec.ts` 的情境 8。
2. `start.spec.ts` 的 10 人開始。

兩次都停在 `createHost`：`expect(page).toHaveURL(/\/host\/.+/)` 逾時 5 秒，網址還是 `/`。失敗時的頁面快照有錯誤提示「連線或伺服器出了問題，請稍後再試」。原因是首頁在 Socket.IO 連上之前按了「建立房間」（[QA-09](qa/bugs.md#qa-09)）：我另外把 Socket.IO 的回應延遲 1.5 秒，穩定重現同樣的提示。負載高、連線慢時就會踩到。

改用 `--workers=2`（CI 的設定）後，完整 67 個測試通過（上表）。我沒有改 `playwright.config.ts`，也沒有改測試或程式，這一票只記錄並建議修（[known-limitations.md](known-limitations.md)）。第一次失敗的 `e2e.log` 被後來的重跑覆蓋，所以只保留第二次的紀錄；兩次失敗的測試不同（上面列的兩個），但錯誤訊息與原因一致。

## 多人操作測試證據

多人操作有兩層證據：

- **E2E 的 21 個情境**，真的瀏覽器模擬主持人加 4 到 15 支手機。
- **探索式 QA**，在建置後的正式版本上跑 6 個角色，共 18 場遊戲、326 個房間、約 1300 筆事件。每一項的結果對照 Event Log。QA 期間 Event Log 沒有 `SERVER_ERROR`，Server 輸出沒有 error 行。

| 角色                   | 報告                                               | Game ID（部分）                           |
| ---------------------- | -------------------------------------------------- | ----------------------------------------- |
| 第一次玩的新手         | [qa/01-new-player.md](qa/01-new-player.md)         | `3678f5ee-812f-41bb-b17a-7bbf9690c57f`    |
| 重複點擊的玩家         | [qa/02-repeat-clicker.md](qa/02-repeat-clicker.md) | `31c70bb7-22aa-4cd4-8054-7cdfbb5e823d`    |
| 不斷重新整理的玩家     | [qa/03-refresher.md](qa/03-refresher.md)           | `64bb5df4-6908-4e7d-95a2-d7038de2ef45`    |
| 中途斷線重連的玩家     | [qa/04-reconnect.md](qa/04-reconnect.md)           | `4c7c5809-e9cb-4fc2-b0ee-e25f628a93ef` 等 |
| 想偷看別人題目的玩家   | [qa/05-peeker.md](qa/05-peeker.md)                 | `b9a13e9e-dd16-49af-b826-1ba486115144`    |
| 操作主持人介面的使用者 | [qa/06-host-ui.md](qa/06-host-ui.md)               | `a9151f3b-7904-4f33-9b5a-692db4ce8518`    |

重點結果：

- 連點加入、開始、淘汰、下一輪，Server 都只生效一次（真實雙擊與同步連點都測）。
- 各 phase 重新整理都能接回；題目重整後重新隱藏。
- 斷線期間被淘汰，恢復後畫面正確。瀏覽器離線的恢復時間是 1.4 到 8.0 秒（退避重連）；網路無聲中斷要 45 秒才發現（QA-01）。
- 沒有找到偷看別人詞語或陣營的方法（讀封包、改 localStorage、偽造事件、猜 Token）。
- 兩個主持人分頁同時操作，遊戲狀態不會壞。

## QA 報告連結

[qa/README.md](qa/README.md)（總覽）、[qa/bugs.md](qa/bugs.md)（Bug 清單）、[known-limitations.md](known-limitations.md)。

## Docker

在本機（Docker Desktop，Docker 28.4.0）建置 `Dockerfile`，映像檔 81 MB（`docker image inspect` 的 Size），以 `node` 使用者執行，容器內 Node 為 v20.20.2。啟動後：

- `GET /healthz` 回 200 `{"ok":true}`，`docker inspect` 的健康檢查狀態是 `healthy`。
- `GET /config` 回設定的 `PUBLIC_BASE_URL`。
- `/admin/*` 不帶 Token 回 401，帶 Token 查不存在的遊戲回 404。
- 用 Node 的 socket.io-client 建立房間並驗證主持人，管理端點查到 `ROOM_CREATED`、`HOST_AUTHENTICATED`，並且 `/data/events.db` 由 `node` 使用者建立（volume 有效）。
- `better-sqlite3` 在建置時沒有編譯（用預編譯檔），所以「從原始碼編譯」這條路徑這次沒有走過。

沒有測：Nginx、Caddy 反向代理的實際行為（`deployment.md` 的範例沒有實際跑過）、ARM 架構、HTTPS。

## 沒有做的測試

- 真機（iOS Safari、Android Chrome）、鎖屏、App 切換器縮圖、換網路、投影：[manual-test-checklist.md](manual-test-checklist.md)，結果「待執行」。
- 超過 15 人、多房間壓力測試：本票明確不做。
- 在 CI 上重新跑這一票的 commit：推送後由 CI 執行，結果以 PR 的檢查為準。
