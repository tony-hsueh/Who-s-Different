# 設計決定

這份文件記錄 PR-01（專案骨架）做過的選擇，以及票上沒寫清楚、我選最簡單做法的地方。

## 為什麼用 Vite，不用 Next.js

遊戲需要 Socket.IO 長連線。Next.js 要掛 Socket.IO，就得自己寫 custom server，這樣會失去 Next.js 大部分的部署便利，而且 Next.js 預設的部署方式（serverless）本來就不適合長連線。

這個遊戲沒有 SEO 與伺服器端渲染的需求，頁面都是連上房間後才有內容。Vite 打包出純靜態檔，再由我們自己的 Express 一起提供，一個程式、一個連接埠，部署最單純。

## 與票上寫法不同的地方

- **ESLint 用 flat config（`eslint.config.js`），不是 `.eslintrc.cjs`。** ESLint 8 已經終止維護，舊格式在新版本已移除。裝的是目前穩定版 ESLint 10，票上寫 9，但兩者設定格式相同，之後要降版只要改 `package.json`。
- **Vitest 用 4.x、jsdom 用 29.x、concurrently 用 9.x，不是最新大版本。** 最新的 Vitest 5、jsdom 30、concurrently 10 要求 Node 22 以上。票上要求 CI 用 Node 20、`engines.node` 為 `>=20`，所以先選仍支援 Node 20 的版本。哪天把 Node 底線拉到 22，這三個可以一起升。
- **多了一個 `tsconfig.node.json`。** 它只檢查測試檔、設定檔與 `e2e/`。`tsconfig.server.json` 要拿去建置，所以排除了測試檔，不然測試會被編進 `dist`。

## 其他自己決定的細節

- **目錄。** `src/shared`、`src/server`、`src/client`。`index.html` 放在專案根目錄，這是 Vite 預設位置，不用額外設定 `root`。
- **TypeScript。** `tsconfig.json` 只放共用的嚴格選項，三個子設定（server、client、node）各自 `extends`。沒有用 project references，因為它要求 `composite`，和 `noEmit` 互相卡住。代價是編輯器開 `src` 下的檔案時，不一定吃到這份設定。以 `npm run typecheck` 為準。
- **伺服器建置。** 只用 `tsc -p tsconfig.server.json`，`rootDir` 是 `src`、`outDir` 是 `dist/server`，所以入口是 `dist/server/server/index.js`，共用程式碼在 `dist/server/shared`。後端用 NodeNext，import 要寫 `.js` 副檔名。前端用 Bundler 解析，不寫副檔名。
- **何時提供前端檔案。** `src/server/index.ts` 看自己旁邊有沒有 `../../client`。編譯後（`dist/server/server/`）剛好指到 `dist/client`，所以 `npm start` 會提供靜態檔。開發時用 `tsx` 直接跑 `src/server/`，同樣的路徑不存在，所以不會提供，網頁由 Vite 負責。這樣不必靠 `NODE_ENV`，Windows 也不用 `cross-env`。
- **SPA fallback。** 只對 `GET` 回 `index.html`，而且排在 `/healthz` 與靜態檔之後。`/socket.io` 由 Socket.IO 在 HTTP 伺服器層先接走，不會走到 Express。這三點都有測試。
- **開發代理。** Vite 把 `/socket.io`（含 WebSocket）與 `/healthz` 轉到 `http://127.0.0.1:<PORT>`，`PORT` 預設 3000，和後端讀同一個環境變數。用 `127.0.0.1` 而不是 `localhost`，避免 Windows 上 `localhost` 先解析成 IPv6 而連不上只監聽 IPv4 的後端。Vite 預設 5173，`server.host: true` 讓區網的手機也能連。
- **連接埠。** 後端預設 3000，監聽 `0.0.0.0`。Playwright 固定用 3100，避免和開發中的 3000 衝突。
- **echo 事件。** 事件型別放在 `src/shared/index.ts`，前後端共用。payload 先定成 `{ text: string }`。客戶端沒帶 ack 函式時，伺服器直接忽略，不會當掉，這是 Socket.IO 事件的邊界檢查，有測試。
- **測試。** 不裝 `@testing-library/jest-dom`，用 `getByRole` 找得到標題就等於它存在。後端測試用 supertest 與真正的 socket.io-client。
- **Playwright。** 只跑 chromium，webServer 跑 `npm run build && npm start` 的正式版，所以會驗證單一連接埠。`reuseExistingServer` 關掉，避免誤用舊的伺服器。baseURL 用 `127.0.0.1`，原因同上。手機版用 390x844 的 viewport，在同一個 chromium 專案裡驗證。
- **Prettier。** 單引號，`endOfLine: lf`。`.claude/` 不檢查，那是工具設定。
- **換行。** `.gitattributes` 設 `* text=auto eol=lf`。Windows 的 `core.autocrlf=true` 加上 CI 在 Linux，不統一會讓 Prettier 在其中一邊報錯。
- **CI。** Node 20，npm 快取，依序跑 lint、typecheck、test、build、e2e。不論成功失敗都上傳 `playwright-report` 與 `test-results`。
- **`.env.example`。** 只有 `PORT` 現在有用。`PUBLIC_BASE_URL`、`LOG_DB_PATH`、`ADMIN_TOKEN` 是給之後的 PR 預留的位置。程式目前不會讀 `.env`，要用請自己在 shell 設定。
- **沒有做的事。** 遊戲邏輯、房間、詞庫、版面與字型、資料庫、Docker 與部署，都留給後續 PR。

## PR-02 遊戲規則

票上沒寫清楚的地方，我這樣選。

- **錯誤用結果物件回傳。** `createGame`、`eliminate`、`skipRound`、`nextRound` 失敗時回 `{ ok: false, code, message }`，不丟例外。只有 `minorityCountFor` 人數不合法時會丟 `RangeError`，因為票上這樣要求。
- **`createGame` 會擋重複的玩家 ID。** 回 `DUPLICATE_PLAYER`。人數不是 4 到 15 人，回 `INVALID_PLAYER_COUNT`。
- **同一輪不能淘汰兩次，靠 `reveal` 階段擋。** 淘汰後進 `reveal`，`eliminate` 只接受 `playing`，所以再淘汰會回 `INVALID_PHASE`。`lastEliminationRound` 也一併記錄，之後要檢查或顯示可以用。
- **跳過這輪直接進下一輪。** `skipRound` 加一筆 `playerId: null` 的紀錄，輪數加一，階段維持 `playing`，不經過 `reveal`。這是總覽的假設 2。
- **`WordPair` 是結構型別。** 只有 `id`、`wordA`、`wordB`。PR-03 的 `QuestionPair` 多了分類與難度，但結構上相容，`createGame` 可以直接收，不用 import 題庫，兩個 PR 不會互相卡住。
- **亂數由外部傳入。** 規則函式吃 `() => number`，值落在 0 到 1 之間（不含 1）。`createSeededRng` 用 mulberry32，測試用固定 seed 就能重現。`shuffle` 是 Fisher–Yates，不會改到傳入的陣列。
- **哪個字當多數詞，先抽一次亂數決定，再洗牌選少數玩家。** 兩件事用同一個 rng，順序固定，同一個 seed 結果一樣。

## PR-03 題庫與抽題

- **`recentIds` 由呼叫端保管。** 抽題是純函式，房間（PR-04）自己存最近用過的題目 id，順序是舊到新。抽題只看最後 N 筆，N = `min(10, 題庫數 - 1)`，所以題庫只有一組時 N = 0，永遠抽那一組。
- **用完之後怎麼抽。** 先排除最後 N 筆，再從剩下的題目裡優先挑這個房間從沒用過的（隨機）。都用過時，挑最後一次使用時間最早的那組，這一步不用亂數，結果固定。`recentIds` 裡不在題庫的 id 直接忽略，所以之後刪題不會出錯。
- **`rng` 由外部傳入。** 型別是 `() => number`，回傳 0 到 1 之間的數，正式環境傳 `Math.random`，測試傳固定種子的亂數。
- **驗證比對前先去頭尾空白。** `'貓'` 和 `' 貓 '` 視為同一個詞，避免多打空白就騙過檢查。驗證會一次列出所有問題，啟動時題庫有錯，Server 直接停止。
- **類別與難度。** PRD 範例沒有標類別與難度，由我標。`difficulty` 目前不使用，依票保留欄位。
