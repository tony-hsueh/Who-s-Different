# QA 角色 5：想偷看別人題目的玩家

**目標：** 一位拿到合法座位的玩家，用盡手段看別人的詞語或身分。
**腳本：** `role5-peeker.mjs`、`role5b-host-frames.mjs`　**Game ID：** `b9a13e9e-dd16-49af-b826-1ba486115144`（role5 的遊戲）；role5b 另開一局，Game ID 沒有另外記錄，可由房間事件查。

## 結論

**沒有找到任何偷看別人詞語、陣營或 Token 的方法。** 找到兩個 P3（沒有以 IP 為單位的限流、`X-Powered-By` 標頭），都不洩漏秘密。

## 1. 讀 WebSocket 與輪詢的封包

用 Playwright 記錄 5 個玩家頁與主持人頁的所有 WebSocket 影格與 Socket.IO 輪詢封包。

| 檢查                                                                        | 結果                                                     |
| --------------------------------------------------------------------------- | -------------------------------------------------------- |
| 每位玩家的封包（15–27 個），遊戲結束前有沒有另一個陣營的詞                  | 沒有（5 人各查一次）                                     |
| 遊戲結束前任何玩家封包有沒有 `role` 欄位                                    | 沒有                                                     |
| 主持人的封包（25 個，role5b）遊戲結束前有沒有任何詞語、`secretWord`、`role` | 沒有                                                     |
| 淘汰一位平民後，主持人封包                                                  | 只多出 1 個 `role`（被淘汰者，依規定公開），沒有少數詞語 |
| 遊戲結束後                                                                  | 平民詞與臥底詞、所有人的身分才出現（依規定）             |

第一次 role5 的主持人封包沒抓到（錄影器在頁面連線之後才掛上，0 個封包，那一項沒有意義），role5b 在頁面載入前掛上錄影器，重新驗證過。

## 2. 改瀏覽器裡的資料

| 動作                                                             | 結果                                                                                      |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 看 `localStorage`、`sessionStorage`、cookie                      | 只有一個 `wd:player:<房間代碼>`，值是 Token；沒有詞語、陣營                               |
| 隱藏中的題目卡的 HTML                                            | 不含詞語                                                                                  |
| 把自己的 Token 改成亂碼（`garbage.token`）後重新整理             | Token 被清掉，畫面是「房間已失效」（不是加入表單，見 [QA-02](bugs.md#qa-02)），看不到題目 |
| 把 Token 最後一個字元改掉                                        | 「登入資訊無效，請重新加入」，回到加入表單                                                |
| 改回原本的 Token                                                 | 恢復原座位                                                                                |
| 把主持人的 Token 放進玩家的 key                                  | 被拒絕（「登入資訊無效」）                                                                |
| 把玩家 Token 放進主持人的 key，開 `/host/<roomId>`               | 被拒絕，沒有任何主持人按鈕                                                                |
| 沒有 Token 的新瀏覽器開 `/host/<roomId>`（房間 ID 在公開狀態裡） | 「房間已失效」，沒有任何主持人按鈕                                                        |

## 3. 用 Node 的 socket.io-client 偽造事件

| 動作                                                                                                        | 結果                                        |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 沒驗證就送 `game:start`、`game:eliminate`、`game:skip-round`、`game:next-round`、`game:reset`、`room:leave` | 全部 `UNAUTHENTICATED`                      |
| 沒驗證的連線監聽所有事件，其間主持人淘汰了一位玩家                                                          | 一個事件都沒聽到                            |
| 玩家身分送 5 種主持人事件                                                                                   | 全部 `FORBIDDEN`                            |
| 玩家連線再送 `host:auth`（用主持人的 Token）                                                                | `ALREADY_AUTHENTICATED`（不能換身分）       |
| 玩家連線再送 `player:auth`（用另一位玩家的 Token）                                                          | `ALREADY_AUTHENTICATED`                     |
| `room:leave` 夾帶 `playerId` 想踢別人                                                                       | `INVALID_PAYLOAD`                           |
| 帶 `__proto__` 的 `game:eliminate`                                                                          | `FORBIDDEN`（玩家身分），沒有影響           |
| 玩家連線送「Server 才會發的事件」`game:player-state`、`room:state`、`room:closed`                           | Server 不處理；另一位玩家與主持人的畫面不變 |

## 4. 猜 Token

| 動作                                                                         | 結果                                                                                                    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 用真實的房間 ID 加 32 位元組隨機字串，猜 54 次（`host:auth`、`player:auth`） | 54 次全是 `INVALID_TOKEN`                                                                               |
| 單一連線連送 30 個請求                                                       | 20 個被 `RATE_LIMITED`（每連線每秒 10 個）                                                              |
| 25 條連線各送 10 個                                                          | 250 個都進到 Token 檢查（0.6 秒）。**限流是以連線為單位，開多條連線就繞過**（QA-07，P3）                |
| 30 條連線各送 10 個 `room:create`                                            | 0.7 秒內建出 300 個房間（QA-07）                                                                        |
| 有真實房間 ID 的假 Token 與不存在房間 ID 的假 Token                          | 前者 `INVALID_TOKEN`，後者 `ROOM_NOT_FOUND`，可以分辨房間存在與否；房間 ID 本來就在公開狀態裡，不是秘密 |

Token 是 32 位元組隨機（256 位元），暴力猜測不可行；限流缺口只造成資源耗用，不造成洩漏。

## 5. HTTP

| 動作                                                                                      | 結果                                                                |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `/admin/rooms/:id/events` 不帶 Token、帶錯 Token、把 Token 放在網址參數                   | 全部 401                                                            |
| 帶正確 Token 的回傳（8.5 KB，一整場）                                                     | 沒有詞語、沒有 Token；`role` 只出現在被淘汰者的 `PLAYER_ELIMINATED` |
| `/..%2f..%2fpackage.json`、`/%2e%2e/%2e%2e/package.json`、`/src/server/index.ts`、`/.env` | 都是 200，但內容是首頁（SPA fallback），沒有洩漏原始碼              |
| 前端 JS（414 KB）有沒有題庫詞語                                                           | 用 14 場遊戲的 28 個詞去比對，沒有一個出現；題庫只在 Server         |
| 回應標頭                                                                                  | CSP 正確；有 `X-Powered-By: Express`（QA-08，P3）                   |

## 證據

`qa/05-peeker/results.log`、`qa/05-peeker/host-frames-before-end.txt`（第一次沒抓到，是空的）、`qa/05-peeker/frames-*-minority-before-end.txt`、`qa/05-peeker/storage-dump-*.json`、`qa/05-peeker-b/results.log`、`qa/05-peeker-b/host-frames-before-end.txt`（本機）。

## 沒測的

站在別人旁邊看螢幕、翻拍、錄影，這是遊戲本身擋不了的。App 切換器縮圖的遮蔽效果要真機才看得到，見 [manual-test-checklist.md](../manual-test-checklist.md)。
