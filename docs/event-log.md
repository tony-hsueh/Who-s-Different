# Event Log

每一場遊戲的重要事件都寫進 SQLite。出問題時，用 Game ID 可以還原一場遊戲的過程，用房間 ID 可以看到加入、離開與連線的事件。Log 裡沒有詞語、Token，也沒有存活玩家的陣營。

## 查詢方式

### 1. CLI（在跑 Server 的機器上）

```bash
npm run logs -- --game <gameId>       # 一場遊戲的事件（只含有 Game ID 的事件，見下方「Game ID 查得到什麼」）
npm run logs -- --room <roomId>       # 一個房間的所有事件（含連線與加入離開，可以從事件裡找出 Game ID）
npm run logs -- --private             # 所有遊戲的題目與陣營分配
npm run logs -- --private --game <gameId>
npm run logs:cleanup                  # 立刻清理 30 天前的資料
```

- 資料庫路徑讀 `LOG_DB_PATH`，沒設就是 `./data/events.db`。要和 Server 用同一個值。
- 輸出是 JSON。事件依時間排序，同一毫秒的事件照寫入順序。
- `--private` 會顯示兩個詞語與每位玩家的陣營，只能在本機用 CLI 讀。HTTP 端點不提供。
- CLI 用 `tsx` 執行，需要安裝開發依賴（`npm ci`）。正式 Docker 映像檔沒有 `tsx`，請改用 HTTP 端點，或把 `events.db` 複製出來在有原始碼的機器上查（見 [deployment.md](deployment.md)）。

### 2. HTTP（要設 `ADMIN_TOKEN`）

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/admin/games/<gameId>/events
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/admin/rooms/<roomId>/events
```

| 狀況                                 | 回應                                          |
| ------------------------------------ | --------------------------------------------- |
| 沒設 `ADMIN_TOKEN`                   | 所有 `/admin/*` 回 404                        |
| 沒帶或帶錯 Token（包含放在網址參數） | 401                                           |
| 查不到該 Game ID 或房間              | 404（`GAME_NOT_FOUND`、`ROOM_NOT_FOUND`）     |
| 成功                                 | `{ "events": [ ... ] }`，payload 已解析成物件 |

- 房間 ID 就是主持人網址 `/host/<roomId>` 的最後一段。用它查房間事件，就能找到 Game ID。
- HTTP 端點只讀 `game_events`，不回 `game_private_records`（詞語與陣營分配）。
- Bearer Token 在 HTTP 上是明文傳送，公開網路請走 HTTPS，見 [deployment.md](deployment.md)。

### 3. 直接開 SQLite

```bash
sqlite3 data/events.db "select timestamp, event_type, player_id, payload from game_events where game_id = '<gameId>' order by timestamp, rowid"
```

## 資料表

| 表                     | 內容                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `game_events`          | 每一筆事件：`event_id`、`timestamp`（ISO 8601）、`room_id`、`game_id`、`round_number`、`player_id`、`event_type`、`payload`（JSON） |
| `games`                | 每場一列：開始與結束時間、人數、少數人數、勝方、輪數。由 `GAME_STARTED`、`GAME_FINISHED` 推出來                                     |
| `game_private_records` | 每場的題目 ID、兩個詞語、每位玩家的陣營。只能用 CLI 讀                                                                              |

沒有玩家身分的事件（例如猜錯 Token）`room_id` 是空字串。

## Game ID 查得到什麼

`--game` 與 `/admin/games/:gameId/events` 只回有 Game ID 的事件：`GAME_STARTED`、`WORDS_ASSIGNED`、`ROUND_STARTED`、`ELIMINATION_CONFIRMED`、`PLAYER_ELIMINATED`、`ROUND_SKIPPED`、`WIN_CONDITION_MET`、`GAME_FINISHED`、`GAME_RESET`，以及遊戲進行中發生的 `OPERATION_IGNORED`、`OPERATION_REJECTED`。

**這些事件沒有 Game ID，只查得到房間：** `ROOM_CREATED`、`HOST_AUTHENTICATED`、`PLAYER_JOINED`、`PLAYER_AUTHENTICATED`、`PLAYER_LEFT`、`PLAYER_DISCONNECTED`、`PLAYER_RECONNECTED`、`HOST_DISCONNECTED`、`HOST_RECONNECTED`，以及沒有綁定身分的請求被拒絕（`room_id` 是空字串，哪個房間都查不到）。查連線問題請用 `--room <roomId>`，再依 `player_id` 與時間過濾。（這是 QA 時從 18 場遊戲的 Log 數出來的，哪些事件帶 Game ID 以 `src/server/` 寫入處為準。）

## 事件清單

| 事件                    | 什麼時候寫                                                    | `payload`                                                                                        |
| ----------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `ROOM_CREATED`          | 建立房間                                                      | `roomCode`                                                                                       |
| `HOST_AUTHENTICATED`    | 主持人連線驗證成功（包含重新整理、重連）                      | 空                                                                                               |
| `PLAYER_JOINED`         | 玩家加入                                                      | `playerCount`                                                                                    |
| `PLAYER_AUTHENTICATED`  | 玩家連線驗證成功（包含重新整理、重連）                        | 空                                                                                               |
| `PLAYER_LEFT`           | 玩家在 Lobby 按離開                                           | `playerCount`                                                                                    |
| `PLAYER_DISCONNECTED`   | 玩家最後一條連線斷掉，且 3 秒內沒有回來                       | 空                                                                                               |
| `PLAYER_RECONNECTED`    | 之前記過斷線的玩家再次上線                                    | 空                                                                                               |
| `HOST_DISCONNECTED`     | 主持人最後一條連線斷掉，且 3 秒內沒有回來                     | 空                                                                                               |
| `HOST_RECONNECTED`      | 之前記過斷線的主持人再次上線                                  | 空                                                                                               |
| `GAME_STARTED`          | 開始遊戲                                                      | `playerCount`、`minorityCount`                                                                   |
| `WORDS_ASSIGNED`        | 發詞完成                                                      | `questionPairId`、`playerCount`（不含詞語）                                                      |
| `ROUND_STARTED`         | 每一輪開始（包含第 1 輪、下一輪、跳過後的新一輪）             | 空                                                                                               |
| `ELIMINATION_CONFIRMED` | 主持人確認淘汰                                                | 空                                                                                               |
| `PLAYER_ELIMINATED`     | 淘汰結果                                                      | `gameId`、`round`、`eliminatedPlayerId`、`role`（被淘汰者）、`remaining`、`winReached`、`winner` |
| `ROUND_SKIPPED`         | 主持人按「本輪無人淘汰」                                      | 空                                                                                               |
| `WIN_CONDITION_MET`     | 達成勝負                                                      | `winner`、`remaining`                                                                            |
| `GAME_FINISHED`         | 遊戲結束                                                      | `winner`                                                                                         |
| `GAME_RESET`            | 主持人按「再玩一場」                                          | 空（帶剛結束那場的 Game ID）                                                                     |
| `OPERATION_IGNORED`     | 重複或不適用的操作（例如遊戲中再按開始）。回 ok，沒有任何變化 | `event`                                                                                          |
| `OPERATION_REJECTED`    | 請求被拒絕                                                    | `event`、`code`（例如 `FORBIDDEN`、`ROUND_MISMATCH`、`INVALID_TOKEN`）                           |
| `SERVER_ERROR`          | Handler 丟出未預期的例外（Client 收到 `INTERNAL_ERROR`）      | `event`、`error`（只有錯誤類型，沒有訊息）                                                       |
| `ROOM_CLOSED`           | 房間閒置 2 小時被清除                                         | 空                                                                                               |

一場遊戲開始時的順序是 `GAME_STARTED`、`WORDS_ASSIGNED`、`ROUND_STARTED`。淘汰時是 `ELIMINATION_CONFIRMED`、`PLAYER_ELIMINATED`，達成勝負再加 `WIN_CONDITION_MET`、`GAME_FINISHED`。跳過一輪是 `ROUND_SKIPPED`、`ROUND_STARTED`。

## 怎麼查問題

1. 從主持人網址取得 `roomId`，查 `--room <roomId>`，看出 Game ID。
2. 用 `--game <gameId>` 看遊戲本身的順序（開始、每輪、淘汰、結束）。
   連線、加入、離開沒有 Game ID，要在 `--room <roomId>` 的結果裡找。
3. 常見判讀：
   - 一直出現 `OPERATION_REJECTED`：看 `code`。`ROUND_MISMATCH` 多半是兩個主持人分頁或過時的視窗；`INVALID_TOKEN` 是 Token 錯或過期。
   - `PLAYER_DISCONNECTED` 與 `PLAYER_RECONNECTED` 的時間差就是玩家離線多久（`PLAYER_DISCONNECTED` 是斷線後 3 秒才寫，所以實際離線要再加 3 秒）。這兩種事件沒有 Game ID，用 `--room <roomId>` 查，再依 `player_id` 過濾。
   - `SERVER_ERROR`：Server 的標準錯誤輸出也有對應的堆疊。
   - 玩家說「我看到的詞不一樣」：`--private --game <gameId>` 看真正的詞語與陣營分配。

## 清理

- Server 啟動時清一次，之後每 24 小時一次。刪除 30 天前（嚴格早於）的 `game_events`、`game_private_records` 與 `games`。
- `npm run logs:cleanup` 可以手動立刻跑。
- 清理失敗只印到標準錯誤，不影響遊戲。
- 備份：先停服務再複製 `events.db`，或用 `sqlite3 events.db ".backup backup.db"`。

## 隱私

詞語與陣營分配放在獨立的表，且只用本機 CLI 讀。其餘事件經過 `redact()`，會移除 `sessionToken`、`hostToken`、`secretWord`、`majorityWord`、`minorityWord`、`assignments`，任何深度都處理。`PLAYER_ELIMINATED` 的 `role` 是被淘汰者的陣營，依遊戲規則本來就公開。
