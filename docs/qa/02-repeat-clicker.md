# QA 角色 2：重複點擊的玩家

**目標：** 連點加入、查看、離開、開始、淘汰、下一輪，不能出現重複玩家、重複淘汰或亂掉的畫面。
**腳本：** `role2-repeat-clicker.mjs`（同步連點壓力）、`role2b-realistic-dblclick.mjs`（真實雙擊）
**Game ID：** `31c70bb7-22aa-4cd4-8054-7cdfbb5e823d`（壓力測試那一場）

## 兩種點法

- **真實雙擊：** Playwright `dblclick`，兩次點擊之間 React 會重畫。這是人手會做的事。
- **同步連點：** 在同一個 JavaScript 工作裡對按鈕呼叫 6 到 8 次 `el.click()`，中間不重畫。人手做不到，只用來壓 Server 與 Client 的防呆。

## 結果

| 操作                           | 真實雙擊             | 同步連點 6–8 次                                                                                                                                                 |
| ------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 建立房間                       | 1 個房間             | **6 個房間**（QA-05）                                                                                                                                           |
| 加入（同暱稱）                 | 1 位玩家，無錯誤提示 | 1 位玩家。Server 對其餘 7 次回 `NICKNAME_TAKEN`，畫面無錯誤                                                                                                     |
| 離開房間（確認視窗按「確定」） | 回到首頁，無錯誤提示 | 回到首頁，但跳出 5 個錯誤提示（「尚未登入房間…」「連線或伺服器出了問題…」）（QA-05）                                                                            |
| 開始遊戲                       | 1 場                 | 1 場（`GAME_STARTED` 1 筆，另 5 個請求被 Server 記為 `OPERATION_IGNORED`）                                                                                      |
| 查看／隱藏題目 41 次           | —                    | 最後停在「顯示」，再按一次隱藏，DOM 沒有殘留詞語                                                                                                                |
| 確認淘汰                       | 1 次淘汰             | 1 次淘汰（`PLAYER_ELIMINATED` 1 筆）。**沒有多餘的請求到 Server**：Log 沒有任何 `OPERATION_IGNORED` 或 `OPERATION_REJECTED`，畫面的防呆（`inFlight` ref）擋住了 |
| 下一輪                         | 進入 Round 2 一次    | 進入 Round 2 一次（`ROUND_STARTED` 第 1、2 輪各 1 筆），同樣沒有多餘的請求                                                                                      |

## 結論

- 「開始遊戲」的防呆是靠 `starting` state，同步連點擋不住，6 次點擊有 6 個請求到 Server；Server 端是冪等的，第 1 次開始，其餘 5 次回 ok 並記成 `OPERATION_IGNORED`，只有 1 場。
- 「確認淘汰」與「下一輪」的畫面防呆（ref）有效，同步連點也只送出 1 個請求，所以 Log 沒有多餘的事件。直接用 socket 重送的 Server 端保護（`ROUND_MISMATCH`、`INVALID_PHASE`、`ALREADY_ELIMINATED`）另在 [06-host-ui.md](06-host-ui.md) 驗證。
- Client 端：真實連點沒有問題。只有程式內同步連點時，「建立房間」與「離開房間」的防呆是靠 React state，擋不住，結果是多出空房間和一串錯誤提示。屬於 P3 加固，見 [QA-05](bugs.md#qa-05)。

## 證據

`qa/02-repeat-clicker/results.log`、`qa/02-repeat-clicker-real/results.log`、截圖 `after-leave.png`（錯誤提示）、`after-leave-dblclick.png`（真實雙擊，乾淨）。
