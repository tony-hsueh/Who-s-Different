# 誰跟我不一樣？

在同一個房間裡，用手機和一台大螢幕一起玩的派對遊戲。大家拿到的詞語幾乎一樣，只有少數人拿到不同的詞。輪流描述自己的詞語，現場投票，把拿到不同詞語的人找出來。

前端是 Vite + React，後端是 Express + Socket.IO，全部使用 TypeScript。一個 Node 程式、一個連接埠就能跑起來，遊戲狀態放在記憶體，事件紀錄放 SQLite。

## 怎麼玩

1. 主持人用筆電或投影的大螢幕打開網站，按「建立房間」，畫面出現 QR Code 與 6 碼房間代碼。
2. 4 到 15 位玩家用手機掃 QR Code，輸入暱稱加入。
3. 主持人按「開始遊戲」。每位玩家在自己的手機上按「查看題目」，看到自己的詞語，再按一次隱藏。多數人拿到同一個詞，少數人拿到另一個詞，沒有人知道自己是哪一邊。
4. 大家輪流描述自己的詞語（不能直接說出來），描述完後現場投票。
5. 主持人在大螢幕點被投出去的人，確認淘汰。畫面揭曉他是平民（多數）還是臥底（少數）。如果這輪沒人被投出去，主持人按「本輪無人淘汰」。
6. 臥底全部被淘汰，平民獲勝；臥底人數追上平民，臥底獲勝。主持人按「再玩一場」回到 Lobby。

少數人數：4 到 6 人 1 位、7 到 10 人 2 位、11 到 15 人 3 位。網頁上不做投票、計時、發言順序、登入與積分，這些都由現場的人自己處理。

## 需求

- Node.js 20.19 以上（建議 22 或 24）
- npm 10 以上
- 要編譯 `better-sqlite3`（沒有預編譯檔的平台）時需要 Python 3、make 與 C++ 編譯器

## 本地啟動

```bash
npm ci
npm run dev
```

這會同時啟動兩個程式：

- 後端：`http://localhost:3000`（改連接埠用 `PORT=3100 npm run dev`）
- 前端 Vite：`http://localhost:5173`，會把 `/socket.io`、`/healthz`、`/config` 轉給後端

開發時請打開 `http://localhost:5173`。

### 用手機連線（同一個 Wi-Fi）

Vite 已經監聽所有網卡。啟動後終端機會印出 `Network:` 那一行，例如 `http://192.168.1.23:5173/`，手機打開那個網址即可。連不上時，先確認手機和電腦在同一個 Wi-Fi，再檢查電腦的防火牆有沒有擋住 Node.js。

要讓大螢幕上的 QR Code 指到手機連得到的網址，設定 `PUBLIC_BASE_URL`（見下面的環境變數）。沒設的時候，QR Code 用主持人瀏覽器網址列的網址，主持人若用 `localhost` 開，手機就連不到。

## 正式模式（單一連接埠）

```bash
npm run build
PUBLIC_BASE_URL=http://192.168.1.23:3000 ADMIN_TOKEN=換成自己的隨機字串 npm start
```

`build` 會產生 `dist/client`（前端）與 `dist/server`（後端）。`start` 用同一個 Node 程式、同一個連接埠（預設 3000）提供網頁、`/healthz` 與 Socket.IO。

```bash
curl http://localhost:3000/healthz
# {"ok":true}
```

### 在區網辦一場試玩

```bash
npm ci && npm run build && npm run start:lan
```

`start:lan` 自動找出區網 IP、設好 `PUBLIC_BASE_URL`、需要時產生 `ADMIN_TOKEN`，再啟動 `dist` 裡的 Server。完整步驟（防火牆、投影、手機連不上）見 [docs/playtest.md](docs/playtest.md)。

要讓同事用行動網路玩，最省事是免費部署到 Render，見 [docs/deploy-render.md](docs/deploy-render.md)。部署到自己的伺服器、加 HTTPS 與用 Docker，見 [docs/deployment.md](docs/deployment.md)。

## 環境變數

| 變數              | 預設               | 說明                                                                                                                      |
| ----------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `PORT`            | `3000`             | Server 監聽的連接埠（監聽 `0.0.0.0`）。                                                                                   |
| `PUBLIC_BASE_URL` | 空                 | 對外網址，只能是來源（例如 `https://game.example.com`，不能有路徑）。QR Code 與房間連結用它；沒設就用主持人瀏覽器的網址。 |
| `LOG_DB_PATH`     | `./data/events.db` | Event Log（SQLite）的檔案路徑，資料夾不存在會自動建立。                                                                   |
| `ADMIN_TOKEN`     | 空                 | 查詢 Event Log 的 HTTP 端點要帶 `Authorization: Bearer <這個值>`。不設就整個停用（回 404）。                              |

範例在 [.env.example](.env.example)。程式不會讀 `.env`，請在 shell 或部署設定裡設定。

## 測試與檢查

| 指令                | 做什麼                                                                          |
| ------------------- | ------------------------------------------------------------------------------- |
| `npm test`          | Vitest 單元與整合測試（後端用 node，前端用 jsdom）                              |
| `npm run test:e2e`  | Playwright 端對端測試（會先建置並在 3100 埠啟動，用真的瀏覽器模擬主持人與手機） |
| `npm run lint`      | ESLint 與 Prettier 檢查                                                         |
| `npm run typecheck` | TypeScript 型別檢查                                                             |
| `npm run format`    | 用 Prettier 整理格式                                                            |
| `npm run logs`      | 查詢 Event Log（見 [docs/event-log.md](docs/event-log.md)）                     |

第一次跑 e2e 前，先安裝瀏覽器：

```bash
npx playwright install chromium
```

E2E 測試很吃資源（15 人的情境會開 16 個瀏覽器 context）。CI 用 2 個 worker；本機核心數很多時，預設的 worker 太多可能偶爾失敗，建議 `npx playwright test --workers=2`。原因與紀錄見 [docs/test-report.md](docs/test-report.md)。

測試結果（影片、trace、報告）放在 `test-results/` 與 `playwright-report/`，已被 git 忽略。

## 目錄

```
src/shared   前後端共用的型別（Socket.IO 協定、遊戲型別）
src/server   Express、Socket.IO、遊戲規則、房間、Event Log
src/client   React 前端（主持人畫面、玩家手機畫面）
tests        後端整合測試
e2e          Playwright 端對端測試
scripts      Event Log 查詢工具、分享預覽圖產生
docs         文件
```

## 文件

| 文件                                                           | 內容                                             |
| -------------------------------------------------------------- | ------------------------------------------------ |
| [docs/architecture.md](docs/architecture.md)                   | 架構圖、模組、資料流、秘密資料怎麼隔離           |
| [docs/decisions.md](docs/decisions.md)                         | 各 PR 的設計決策與對 PRD 的假設                  |
| [docs/playtest.md](docs/playtest.md)                           | 辦一場試玩的指南：主持人準備與同事怎麼玩         |
| [docs/deploy-render.md](docs/deploy-render.md)                 | 免費部署到 Render 的步驟與限制                   |
| [docs/deployment.md](docs/deployment.md)                       | 單一 Node 服務的部署、HTTPS 與 WebSocket、Docker |
| [docs/event-log.md](docs/event-log.md)                         | 事件清單、查詢方式（CLI 與 HTTP）、清理          |
| [docs/test-report.md](docs/test-report.md)                     | 單元與 E2E 結果、QA 結果                         |
| [docs/qa/README.md](docs/qa/README.md)                         | 探索式 QA 報告與 [Bug 清單](docs/qa/bugs.md)     |
| [docs/manual-test-checklist.md](docs/manual-test-checklist.md) | 真機與投影的人工測試清單（待執行）               |
| [docs/known-limitations.md](docs/known-limitations.md)         | 已知限制與後續改善建議                           |
| [docs/assets.md](docs/assets.md)                               | 圖像素材的來源與授權                             |
