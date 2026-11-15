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
- **怎麼抽。** 每「題庫數」局算一輪，每一輪每題剛好出現一次，順序每輪隨機。每一局從「這一輪還沒出過、也不在這個房間最近 N 局裡」的題目隨機抽。最近 N 局的限制只在換輪時有作用：上一輪最後幾局的題目不會出現在下一輪的開頭，同一題至少隔 N 局才會再出。這一輪出過幾局用 `recentIds.length % 題庫數` 算，所以假設同一個房間存在期間題庫不會變（題庫只在部署時改，部署會重建房間）。`recentIds` 裡不在題庫的 id 直接忽略，不會出錯。
- **`rng` 由外部傳入。** 型別是 `() => number`，回傳 0 到 1 之間的數，正式環境傳 `Math.random`，測試傳固定種子的亂數。
- **驗證比對前先去頭尾空白。** `'貓'` 和 `' 貓 '` 視為同一個詞，避免多打空白就騙過檢查。驗證會一次列出所有問題，啟動時題庫有錯，Server 直接停止。
- **類別與難度。** PRD 範例沒有標類別與難度，由我標。`difficulty` 目前不使用，依票保留欄位。

## PR-04 房間、玩家身分與狀態投影

沿用總覽假設 4（Token 12 小時、房間閒置 2 小時清除）和假設 1（不做主持人踢人）。其他票上沒寫清楚的地方，我這樣選。

- **錯誤碼是型別化的聯集。** `RoomErrorCode` 放在 `src/shared/room-types.ts`，前後端共用。房間自己的有 `NICKNAME_EMPTY`、`NICKNAME_TOO_LONG`、`NICKNAME_TAKEN`、`ROOM_FULL`、`ROOM_NOT_FOUND`、`ROOM_CODE_UNAVAILABLE`、`PLAYER_NOT_FOUND`、`GAME_IN_PROGRESS`、`NOT_ENOUGH_PLAYERS`、`INVALID_PHASE`、`INVALID_TOKEN`、`TOKEN_EXPIRED`，再加上 PR-02 的 `RuleErrorCode`。預期內的失敗都回 `{ ok: false, code, message }`，不丟例外。
- **暱稱長度算 code point。** `[...name].length`，上限 12。一個 emoji 算 1 個字，中文一字算 1 個。代價是帶 ZWJ 的組合 emoji（例如家庭 emoji）和帶變體選擇符的字會算成多個字，所以這類暱稱比使用者看到的字數更早被擋。要改成字素（grapheme）只要換成 `Intl.Segmenter`。長度在去頭尾空白之後才算。
- **暱稱比對是完全相同。** 去頭尾空白後逐字比，大小寫視為不同，不做 Unicode 正規化。票上寫「完全相同」，所以我不加額外規則。
- **加入的檢查順序。** 房間不存在、已經開始、暱稱空白、暱稱太長、暱稱重複、房間已滿。
- **房間代碼不分大小寫。** 字元集是 A-Z 與 2-9，去掉 0、O、1、I（共 32 個）。玩家輸入的代碼去空白後轉大寫再比對。產生時最多重抽 1000 次，仍撞號就回 `ROOM_CODE_UNAVAILABLE`，不會無限迴圈。
- **只有 Lobby 能離開。** 票上寫「僅 Lobby 可離開」，所以 `finished` 階段也不能離開，要等 `resetGame` 回到 Lobby。
- **頭像取最小的空位。** `avatarIndex` 從 0 開始，取目前沒人用的最小值，`avatarColor` 是 15 色色盤的同一格。沒人離開時就是加入順序。有人離開再加入，會補上空位，不會和在場的人重複。圖案編號對應哪個圖，留給前端。
- **`Room` 不可變。** 每次更動都換一個新物件，呼叫端手上的舊物件不會被改。`Room` 含秘密狀態，只能經過投影函式送出去。
- **`applyRule` 是 PR-05 用的入口。** 票上沒列，但房間需要一個地方套用 PR-02 的 `eliminate`、`skipRound`、`nextRound`，否則玩到一半的狀態沒辦法進來。它只是把規則函式的結果存回房間，失敗就原樣回傳錯誤碼，房間不變。
- **`startGame` 的亂數與題目。** 抽題與分配陣營共用同一個注入的 `rng`。抽到的題目 id 加進 `recentQuestionIds`，`resetGame` 保留這份記錄，所以再玩一場不會連續同一題。
- **活動時間。** 建立、加入、離開、開始、重置、`applyRule` 都會更新 `lastActivityAt`。PR-06 做在線狀態時，要不要把連線也算活動，由 PR-06 決定。
- **`sweepExpired`。** `SessionRegistry.sweepExpired(now)` 清過期 Token。`RoomStore.sweepExpired(now)` 先清閒置房間（連同它們的 Token），再清過期 Token，回傳被清掉的房間 id，PR-05 可以用來關連線。定時器由 PR-05 啟動。
- **Token 只存 SHA-256 雜湊。** 玩家與主持人 Token 放在不同的表，所以互相不能冒用。比對時用雜湊當 key 查表，再用 `timingSafeEqual` 比一次。過期但還沒被清掉的 Token 回 `TOKEN_EXPIRED`，清掉之後回 `INVALID_TOKEN`。
- **公開狀態只多帶 `playerId`。** `PublicPlayer` 除了暱稱、頭像、存活、在線，還有 `playerId`，主持人點人淘汰要靠它。`playerId` 不是秘密，Session Token 才是。
- **最近一次揭曉結果。** `lastElimination` 取最後一筆淘汰紀錄。最後一筆是「本輪無人淘汰」時不帶，所以跳過一輪後畫面不會顯示上一輪的人。被淘汰者的陣營依票上規定公開，存活者的陣營在 `finished` 之前不出現。
- **私有狀態。** `PlayerPrivateState` 有 `playerId`、`phase`、`roundNumber`、`secretWord`、`eliminated`，沒有 `role`。Lobby 時 `secretWord` 是 `null`。玩家不在房間時 `toPlayerPrivateState` 回 `undefined`，呼叫端用 Token 驗證過身分，正常不會遇到。
- **`online` 預設 `false`。** 更新邏輯留給 PR-06。
- **測試輔助檔。** `src/server/rooms/test-helpers.ts` 不是測試檔，所以在 `tsconfig.server.json` 排除，不會被編進 `dist`。

## PR-05 Socket.IO 協定與遊戲操作

沿用總覽假設 1（不做踢人）、2（跳過一輪直接 Round +1）、4（Token 12 小時、房間閒置 2 小時清除）。票上沒寫清楚的地方，我這樣選。

- **協定用一張表定義。** `src/shared/protocol.ts` 的 `Requests` 一個事件一筆，寫明送出的 payload 和 ack 成功時帶的 `data`。`ClientToServerEvents` 從它推出來，前後端共用，不會各寫一份而對不上。所有請求都用 `Ack<T>`（`{ ok: true, data } | { ok: false, code, message }`）回覆。
- **錯誤碼是一個聯集 `ErrorCode`。** 包含 PR-04 的 `RoomErrorCode`，加上 `FORBIDDEN`（身分不對）、`UNAUTHENTICATED`（還沒綁定）、`ALREADY_AUTHENTICATED`、`INVALID_PAYLOAD`、`RATE_LIMITED`、`ROUND_MISMATCH`（`roundNumber` 不是目前這輪）、`INTERNAL_ERROR`（Handler 丟了例外）。
- **每個請求的處理順序。** 速率限制、payload 格式（zod）、身分與權限、遊戲狀態。不是主持人的玩家打 `game:start` 會先收到 `FORBIDDEN`，不會看到狀態相關的錯誤。沒綁定的 socket 收到 `UNAUTHENTICATED`。
- **沒帶 ack 的請求不會讓 Server 崩潰。** 照常處理，只是沒有回覆。只帶 ack、沒帶 payload 的請求（`socket.emit('room:create', ack)`）當成空 payload。空 payload 的事件（`room:create`、`room:leave`、`game:start`、`game:next-round`、`game:reset`）收到多餘欄位會被擋成 `INVALID_PAYLOAD`。
- **字串長度上限只擋離譜的輸入。** Token 256、id 128、房間代碼 32、暱稱 200 字。暱稱真正的 12 字上限仍由房間規則判斷。`roundNumber` 必須是 1 以上的整數。
- **綁定只做第一次。** `room:create` 不會綁定 socket，要再送 `host:auth`。已綁定的 socket 再送 `host:auth` 或 `player:auth` 回 `ALREADY_AUTHENTICATED`，換身分要重新連線。綁定與離開頻道的程式集中在 `src/server/auth.ts`，PR-06 做重連時改這裡。不做在線狀態，`online` 仍是 `false`。
- **`room:join` 不綁定 socket。** 加入後要送 `player:auth` 才會收到私人狀態。`room:join` 成功與 `room:leave` 成功都會對房間廣播新的 `room:state`，主持人的 Lobby 才會即時更新。
- **頻道。** 綁定時 socket 進 `room:{roomId}`；主持人另進 `host:{roomId}`；玩家另進 `player:{playerId}`。`game:player-state` 只送 `player:{playerId}`，主持人沒進這個頻道，所以永遠收不到。
- **冪等的定義。** 已經是目標狀態就回 `ok`、不重做、不廣播，只記一筆 `OPERATION_IGNORED`。`game:start` 在 `playing` 時；`game:next-round` 在 `playing` 時；`game:reset` 在 Lobby 時。其他階段照常交給房間規則，回 `INVALID_PHASE`（例如 `reveal` 時 `game:start`、`playing` 時 `game:reset`）。
- **同一輪兩次淘汰。** `game:eliminate` 與 `game:skip-round` 先比對 `roundNumber`，不符回 `ROUND_MISMATCH`。同一輪同時送兩次淘汰時，第一個把階段推到 `reveal`，第二個回 `INVALID_PHASE`。Socket.IO 對同一條連線的事件是依序處理，所以不需要鎖。
- **結束後的淘汰。** `finished` 之後 `roundNumber` 沒變，所以帶正確 `roundNumber` 的淘汰回 `INVALID_PHASE`。
- **速率限制。** 每個 socket 一個滑動視窗，任何 1 秒內最多放行 10 個請求，第 11 個起回 `RATE_LIMITED`。被拒的請求不計入視窗，所以不會延長封鎖。只有已註冊的事件會計數，未知事件直接被 Socket.IO 丟掉。時鐘與房間共用注入的 `now`，所以測試可以快轉。
- **清除過期房間。** `createApp` 開一個 `setInterval`（預設 60 秒，`unref()` 不會擋住程序結束）呼叫 `store.sweepExpired()`。被清掉的房間對 `room:{roomId}` 廣播 `room:closed`，然後讓裡面的 socket 離開房間與主持人頻道，但不斷線。之後這些 socket 再送操作會收到 `ROOM_NOT_FOUND`，前端可以據此顯示房間失效。
- **`createApp` 可注入。** 選項有 `store`、`logger`、`now`、`sweepIntervalMs`、`rateLimit`。回傳多了 `store`、`stopSweep()` 與 `close()`（停計時器並關閉所有連線與 HTTP Server）。原本的 `echo` 範例事件與它的測試移除，`/healthz` 與靜態檔行為不變。
- **Logger 介面先定好。** `src/server/log/noop-logger.ts` 定義 `EventLogger.logEvent({ type, roomId?, gameId?, roundNumber?, playerId?, payload })`，預設是什麼都不做。每個 Handler 的成功點都呼叫，所有被拒的請求（含格式錯誤、被限速）統一記 `OPERATION_REJECTED`，payload 只有事件名與錯誤碼。PR-07 只要換掉實作。`payload` 不放秘密詞語、存活者陣營與 Token，並有測試檢查。Logger 丟例外時只印到 stderr，不影響回覆。`roomId` 是選填，因為「房間代碼不存在」時沒有房間 id。
- **加入與回覆的資料很精簡。** `room:create` 回 `roomId`、`roomCode`、`hostToken`；`room:join` 回 `playerId`、`sessionToken`；`host:auth` 回 `state`（公開狀態）；`player:auth` 回 `state` 與 `privateState`。其他操作成功時 `data` 是 `null`，新狀態靠廣播。
- **整合測試的位置。** `tests/integration/`，用真的 Server（port 0）與 `socket.io-client`，加進 `server` 專案的 `include`、`tsconfig.node.json` 與 ESLint 的 Node 範圍。測試用共用的 `TestClient` 記下每個 socket 收到的所有訊息（含 ack），秘密詞語測試就是在這堆訊息裡搜尋。

## PR-07 Event Log 與 SQLite 持久化

沿用總覽假設 5（CLI 加一個要管理 Token 的 HTTP 端點，不做後台頁面）。票上沒寫清楚的地方，我這樣選。

- **`better-sqlite3` 釘在 12.9.0（精確版本）。** 12.10 以後不再發 Node 20 的預編譯檔，CI 是 Node 20.19，會退回用原始碼編譯，需要編譯工具鏈。12.9.0 有 `node-v115-linux-x64`（Node 20）也有 Node 24 的 Windows 預編譯檔。`node:sqlite` 在 Node 20 沒有，所以不能用。要升級時先確認新版仍有 Node 20 的預編譯檔，或把 `engines` 與 CI 升到 Node 22。
- **Logger 介面只加一個選用方法。** `logEvent` 不變。多了選用的 `recordPrivateGame(record)`，專門寫 `game_private_records`。詞語與陣營分配不放進 `LogEvent`，所以 PR-05 的測試（直接檢查 `LogEvent` 裡沒有詞語）照樣成立，PR-06 的假 logger 也不用改。選用方法由 `recordPrivate()` 包住，丟例外只印到 stderr。
- **`games` 表由事件推出來。** `GAME_STARTED` 的 payload 帶 `playerCount`、`minorityCount`，寫入時新增一列；`GAME_FINISHED` 補上 `finished_at`、`winner`、`rounds`。呼叫端不用另外維護 metadata。
- **新增的事件。** `WORDS_ASSIGNED`、`ELIMINATION_CONFIRMED`、`WIN_CONDITION_MET`、`SERVER_ERROR`。`PLAYER_DISCONNECTED`、`PLAYER_RECONNECTED` 留給 PR-06 加進型別，因為它們的呼叫端在 PR-06，兩邊各加會互相衝突。資料庫不限制事件名稱，所以 PR-06 合併後不用改 schema。
- **一局的事件順序。** 開始時依序是 `GAME_STARTED`、`WORDS_ASSIGNED`、`ROUND_STARTED`（第 1 輪）。淘汰時依序是 `ELIMINATION_CONFIRMED`、`PLAYER_ELIMINATED`，達成勝負再加 `WIN_CONDITION_MET`、`GAME_FINISHED`。`GAME_RESET` 帶上剛結束那場的 Game ID 與最後一輪，查那一場時才看得到。
- **淘汰 payload。** `gameId`、`round`、`eliminatedPlayerId`、`role`（被淘汰者，依規定公開）、`remaining`（淘汰後雙方存活人數）、`winReached`，達成勝負時多一個 `winner`。這是 Log，不是對外資料，所以可以有人數。
- **`WORDS_ASSIGNED` 只記題目 id 與人數。** 詞語、陣營分配寫在 `game_private_records`。`redact()` 會在寫入前移除 `sessionToken`、`hostToken`、`secretWord`、`majorityWord`、`minorityWord`、`assignments`，任何深度都處理。`game_private_records` 在遊戲一開始就寫，因為票上要求「題目與陣營分配」可查，這張表只能用本機 CLI 讀，HTTP 端點不回傳。
- **寫入同步、單一交易。** 每筆事件的寫入（含 `games` 更新）包在一個交易裡。排序用 `timestamp` 再用 `rowid`，同一毫秒的事件仍照寫入順序。`event_id` 用 `randomUUID()`。
- **`SERVER_ERROR`。** Handler 丟例外時記一筆，只放事件名與錯誤類型（`error.name`），不放訊息，避免訊息夾帶資料。對 client 仍回 `INTERNAL_ERROR`，同時照舊記一筆 `OPERATION_REJECTED`。
- **`schema.sql` 用 `CREATE ... IF NOT EXISTS`。** 每次啟動都會執行，所以重啟不會出錯。`tsc` 不會複製 `.sql`，`npm run build` 最後多一步把它複製到 `dist/server/server/log/`。
- **路徑與啟動。** `LOG_DB_PATH` 預設 `./data/events.db`（已加進 `.gitignore`），資料夾不存在會自動建立。`ADMIN_TOKEN` 沒設就不給 `createApp` 任何 `admin` 選項。
- **Admin 端點。** `GET /admin/games/:gameId/events`。`/admin` 一律掛在靜態檔與 SPA fallback 前面，沒設 Token 時所有 `/admin/*` 回 404，不會被 SPA fallback 回成 200。Token 先各自做 SHA-256 再用 `timingSafeEqual` 比，長度不同也是固定時間。缺少或錯誤回 401。查不到事件的 Game ID 回 404。回傳 `{ events: [...] }`，payload 已解析成物件。
- **CLI。** `npm run logs -- --game <id>`、`--room <id>`、`--private`（可再加 `--game <id>` 只看一場）。`npm run logs:cleanup` 等於 `--cleanup`。路徑同樣讀 `LOG_DB_PATH`。`scripts/` 加進 `tsconfig.node.json` 與 ESLint 的 Node 範圍。
- **清理。** 刪除 30 天以前（嚴格早於 `now - 30 天`）的事件、私有紀錄，以及開始時間在 30 天以前的 `games` 列。Server 啟動時先跑一次，之後每 24 小時一次，計時器 `unref()`。時鐘可注入，測試用假時鐘與假計時器。清理失敗只印到 stderr，不影響服務。
- **Server 重啟。** 事件只進 SQLite 檔，測試把資料庫關掉再開同一個檔，確認仍查得到。遊戲狀態本身仍只在記憶體，重啟後房間照舊失效。
