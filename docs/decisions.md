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

## PR-08 前端基礎

票上沒寫清楚的地方，我這樣選。

- **路由用 React Router 7（`react-router`）的 data router。** 最新的 8.x 要求 Node 22 以上，和前面幾個套件一樣，先選仍支援 Node 20 的版本。 `createBrowserRouter`，路由表 `routes` 另外匯出，測試用 `createMemoryRouter` 直接套同一份。每條路由用 `handle.mode` 標示字級（`projector` 或 `phone`），共用版面讀它，設到外層 `data-mode`。首頁與主持人畫面是投影模式，玩家畫面與 404 是手機模式。
- **連線狀態放在一個 `ConnectionStore`，不是散在 hook 裡。** 它是普通類別，用 `useSyncExternalStore` 訂閱。這樣 Socket 只有一個，重連、驗證、狀態都在同一處，測試只要換成假的 Socket。Socket 用 `autoConnect: false`，由 Provider 啟動，React StrictMode 重複掛載也不會留下多條連線。
- **自動重連用 Socket.IO 內建的指數退避。** 500 毫秒起跳，上限 10 秒，不限次數。
- **畫面用 `useHostSession(roomId)` 或 `usePlayerSession(roomCode)` 綁定身分。** 綁定後，每次連上（含重連）都會讀 localStorage 的 Token 呼叫 `host:auth` 或 `player:auth`。連線狀態 `status` 有六種：`idle`、`connecting`、`authenticating`、`ready`、`no-token`、`invalid`。`useRoomState()`、`usePlayerState()` 讀最新狀態，`useRequest()` 送請求並在失敗時跳出中文 toast，`silent` 可自己處理錯誤。PR-10 加入成功後要先 `savePlayerToken`，再呼叫 `reauth()` 拿私人狀態。
- **驗證錯誤的處理。** `ALREADY_AUTHENTICATED` 當成功，不跳 toast。`ROOM_NOT_FOUND` 與 `room:closed` 清掉 Token、進 `invalid`，顯示「房間已失效」。`INVALID_TOKEN`、`TOKEN_EXPIRED` 清掉 Token、進 `no-token`，也會跳 toast，讓玩家知道為什麼被請回加入畫面。其他錯誤跳 toast、Token 留著，下次重連再試。`room:closed` 只處理自己的房間：主持人比對網址的 `roomId`，玩家比對已收到的房間狀態。
- **主持人沒有 Token 時也顯示「房間已失效」。** 沒有 Token 這個瀏覽器就沒辦法主持，也沒有別的路可走。玩家沒有 Token 則留在玩家畫面，PR-10 在這裡放加入表單。
- **請求的邊界。** 沒連線時直接回 `INTERNAL_ERROR`，不交給 Socket.IO 暫存，不然它會在重連後、驗證之前先把請求送出去。10 秒沒回、或連線中斷，同樣回 `INTERNAL_ERROR`；中斷時還會清空 Socket.IO 的暫存區，因為心跳逾時但還沒斷線的那段時間，它也會暫存。任何請求收到 `ROOM_NOT_FOUND`，且發出時的身分和現在相同，就當成房間失效。
- **換身分就重新連線。** Server 把一條連線綁給一個身分（PR-05），所以只要已經送出過驗證，離開房間或換到別的房間時，就斷線再連，不然新房間的驗證會回 `ALREADY_AUTHENTICATED`，卻還綁在舊房間。房間失效（`invalid`）之後，重連不會重新驗證，直到換身分為止。
- **Token 在 localStorage 被擋時改放記憶體。** 這一次載入內仍可遊玩（包含斷線重連），重新整理後就沒了，符合票上寫的行為。只有寫入失敗時才用記憶體，所以平常不會蓋掉 localStorage 的值。玩家 Token 的 key 把房間代碼轉大寫。Token 不放網址，也不寫 console，測試有檢查。
- **首頁的「建立房間」真的會動。** 票上只寫按鈕，但沒有它首頁沒法使用，也沒辦法驗證主持人路徑。成功後存 Token 並導到 `/host/:roomId`，失敗跳 toast。
- **CSP 由 `src/server/csp.ts` 的小 middleware 加在所有回應上。** `default-src 'self'`、`script-src 'self'`、`style-src 'self' 'unsafe-inline'`（頭像顏色用 inline style 的 CSS 變數）、`img-src 'self' data:`、`object-src 'none'`、`frame-ancestors 'none'`。`connect-src` 除了 `'self'`，還把這次請求的 `ws://host`、`wss://host` 寫明，因為部分舊版 Safari 的 `'self'` 不含 WebSocket。Host 標頭先用格式檢查，不合格就不加，避免有人塞指令進標頭。不裝 helmet。字型用系統字型，不載入外部資源。
- **頭像圖案有 15 種，對應 `avatarIndex`。** 超過就取餘數。除了顏色，離線與淘汰都有文字標籤（「離線」「已淘汰」），也寫進 `aria-label`，不靠顏色分辨。
- **錯誤訊息表用 `Record<ErrorCode, string>`。** 協定新增錯誤碼時沒補訊息，型別檢查會直接失敗。
- **其他。** `ConfirmDialog` 開啟時焦點在「取消」，避免誤按 Enter 就確認，Escape 等於取消。Toast 5 秒後消失，可手動關閉。`prefers-reduced-motion` 時動畫與轉場幾乎關掉。測試用的假 Socket 放在 `src/client/net/mock-socket.ts`，PR-09 到 PR-12 的元件測試可以直接用。
- **既有 e2e 改了一條。** 「未知路徑仍會載入 App」改成看到 404 標題，因為現在未知路徑會顯示 404。

## PR-09 主持人 Lobby 與 QR Code

沿用總覽假設 1（不做主持人踢人，所以 Lobby 沒有移除玩家的按鈕）。票上沒寫清楚的地方，我這樣選。

- **QR Code 的網址從哪來。** `PUBLIC_BASE_URL` 是 Server 的環境變數，前端讀不到，所以 Server 多一個 `GET /config`，回 `{ publicBaseUrl: string | null }`。Lobby 開啟時問一次；沒設、請求失敗或格式不對，就用主持人瀏覽器網址列的 `window.location.origin`。這樣區網測試時，只要用 `http://<電腦區網 IP>:3000` 開主持人頁，不設環境變數也掃得到。如果主持人用 `localhost` 開，手機掃到的就是 `localhost`，連不上，所以這種情況要設 `PUBLIC_BASE_URL`。`.env.example` 已補上這句說明。
- **`PUBLIC_BASE_URL` 啟動時檢查。** `parsePublicBaseUrl` 只收 http 或 https，只能是網站根網址（不能帶路徑、query、hash 或帳密），結尾的斜線會去掉；填錯就讓 Server 啟動失敗，不要等到玩家掃了打不開才發現。路徑前綴（例如 `https://example.com/wd`）不收，因為前端路由沒有設 basename，掃到會是 404。
- **答案回來前不畫 QR Code。** 先畫猜的網址再換掉，投影上會閃一下，而且主持人可能剛好拿那個舊的去掃。
- **QR Code 自己畫 SVG，不用 `qrcode` 的字串輸出。** 用 `QRCode.create` 取得格子矩陣，把每列連續的深色格合成一條路徑，一個 `<svg>`、一個 `<path>`，沒有 `innerHTML`，也不需要放寬 CSP。糾錯等級 M，留白 4 格。SVG 上有 `data-value` 記下編碼的文字，單元測試靠它檢查「編進去的就是這串網址」。測試沒有真的解碼圖片：編碼文字由 `buildJoinUrl` 組出來，再由元件原樣編碼，這兩段分別有測試。
- **連結只有房間代碼。** `buildJoinUrl(baseUrl, roomCode)` 回 `${baseUrl}/room/${roomCode}`，沒有 query、沒有 hash，主持人 Token 與 `roomId` 都不在裡面，有測試。
- **人數上限與下限搬到 `src/shared/game-types.ts`。** 前端要用 `MIN_PLAYERS`、`MAX_PLAYERS` 決定按鈕與「6 / 15」，不能 import Server 的檔案。`rules.ts` 改成從 shared 引入再原樣匯出，原本的 import 不用動。
- **開始遊戲按鈕。** 人數 4 到 15 才能按，送出後一直 disable，直到伺服器回失敗才恢復。成功時畫面會因為階段改變而離開 Lobby，所以不用另外恢復。是否滿足人數仍由 Server 判斷，前端只是不讓人按。
- **離線標示沿用「離線」。** 票上寫「未連線」，但 PR-08 的頭像元件已經定為「離線」（文字標籤加虛線框，也寫進 `aria-label`），沿用同一組詞，不在 Lobby 另做一套。目前 `online` 要等 PR-06 才會更新，所以在只有 PR-08 的分支上，所有玩家都顯示離線，這是預期的，不是這個 PR 的問題。
- **Lobby 斷線提示。** 主持人自己的連線中斷時，頂端出現紅色橫幅「連線中斷，重新連線中…」，玩家名單維持最後一次的內容。
- **`PlayerGrid` 給 PR-11 重用。** 參數是 `players`、`onSelect`（有給才會變成按鈕）、`isDisabled`、`size`（`md` 或 `sm`）。進場動畫是每個項目掛上時播一次，`prefers-reduced-motion` 時由全域規則關掉。沒有放選取狀態，PR-11 需要時再加。
- **版面。** 投影（寬度 60rem 以上）左邊 QR Code、代碼、連結、提示，右邊人數、頭像網格、開始按鈕；窄螢幕改成上下排列、可捲動。QR Code 的寬度取 22rem 與視窗高度 40% 的較小值，1920×1080 放 15 人不需捲動，有 e2e 量過。比 1920×1080 小很多的筆電螢幕不保證不捲動，票上也只要求 1920×1080。
- **非 Lobby 階段是占位畫面。** `playing`、`reveal`、`finished` 只顯示階段名稱，PR-11、PR-12 接手。還沒收到房間狀態時顯示「連線中…」。
- **E2E 的玩家用 node 端的 socket.io-client 加入。** PR-10 的加入表單還不存在，所以測試直接送 `room:join`，不是 4 個真的玩家瀏覽器。PR-14 會換成真的玩家畫面。
- **既有測試改了兩處。** 主持人頁原本的標題「主持人畫面」不見了，`router.test.tsx` 與 `layout.spec.ts` 改成找 Lobby 的遊戲名稱標題。

## PR-11 主持人遊戲畫面與淘汰確認

票上沒寫清楚的地方，我這樣選。

- **Enter 確認放在 `ConfirmDialog`，用 `confirmOnEnter` 開關。** PR-08 的確認框為了防誤按，開啟時焦點在「取消」，Enter 預設等於按取消。淘汰與跳過這兩個確認框要「Enter 確認」，所以多一個選項：開啟後不管焦點在哪，Enter 都會確認。長按造成的重複按鍵（`event.repeat`）不算，免得用鍵盤選頭像的那一下 Enter 直接把確認框也確認掉。其他用到 `ConfirmDialog` 的地方不受影響。
- **送出期間鎖住按鈕。** `ConfirmDialog` 多 `confirmDisabled`。真正擋住連點的是 `HostPlaying` 裡的 ref，因為 state 要下一次渲染才會變，同一個瞬間的兩次點擊（或一次點擊加一次 Enter）靠 state 擋不住。
- **確認框綁定開啟當下的 Round。** 待確認的動作記著它的 `roundNumber`，Round 變了、或被選的玩家已經淘汰，確認框就直接消失，不會拿舊的選擇去送。送出時帶的也是這個 Round。
- **送出後不論成功或失敗都關掉確認框。** 失敗時 `useRequest` 會跳中文 toast（例如 `ROUND_MISMATCH` 顯示「畫面不是最新的，請稍後再試」），畫面以下一次 `room:state` 為準，不在前端猜結果。
- **「本輪無人淘汰」確認鈕叫「確認」。** 票上沒指定字樣；淘汰那個叫「確認淘汰」，這個沒有人被淘汰，所以用「確認」。
- **離線的存活玩家仍可選。** 票上只要求離線低調顯示。人可能是手機斷線但還在現場，是否淘汰是現場投票決定的，所以不擋。離線標示沿用 PR-08 的頭像（降低透明度、虛線框、「離線」標籤）。目前 `online` 要等 PR-06 才會更新，所以這個分支上每個人都會顯示離線，是預期的。
- **遊戲中畫面不放連線中斷橫幅。** 票上沒列，Lobby 有是因為那裡沒有別的操作。遊戲中若斷線，送出會得到錯誤 toast。
- **頭像放大。** 遊戲中頭像 7.5rem、名字 1.5rem，投影後看得清楚。15 人在 1920×1080 排成兩列，有 e2e 量過不需捲動。
- **`reveal`、`finished` 仍是占位畫面。** 只拿掉 `playing` 的占位，PR-12 接手另外兩個。Lobby 的測試與 e2e 原本找占位標題「遊戲進行中」，改成找 `Round 1`。
- **e2e 用第二條主持人連線把房間推到下一輪。** 揭曉與下一輪畫面是 PR-12，這裡要驗證「已淘汰頭像在下一輪無法點選」，所以測試在 node 端用同一個主持人 Token 另開連線送 `game:next-round`。
- **秘密檢查範圍。** e2e 同時記錄主持人頁的 WebSocket frame、Socket.IO 輪詢的請求與回應，以及整頁 DOM，確認沒有任一位玩家的詞語、沒有 `secretWord` 欄位；`role` 欄位只准出現在 `lastElimination`（被淘汰者的陣營依規則公開）。
