# 部署到 Render 免費方案

讓同事用行動網路（不用同一個 Wi-Fi）也能玩。全程免費，約 15 分鐘。開帳號、按部署都在 Render 網頁上點，不用打指令。

repo 根目錄的 `render.yaml` 已經寫好設定：免費方案、新加坡機房、Docker、健康檢查 `/healthz`、自動產生 `ADMIN_TOKEN`。QR Code 會自動用 Render 給的 `https://<名稱>.onrender.com` 網址，不用自己填 `PUBLIC_BASE_URL`。

## 先知道免費方案的限制

以下照 Render 官方文件（[Free instances](https://render.com/docs/free)，2026-11-16 查）：

| 項目       | 內容                                                                                                 | 對試玩的影響                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 休眠       | 15 分鐘沒有任何流量就休眠，下次有人連進來要**約 1 分鐘**才醒                                         | 試玩前先打開網址等它醒（見下面「每次試玩前」）。遊戲中 WebSocket 有流量，不會睡著 |
| 每月時數   | 每個 workspace 每月 750 小時，休眠時不算                                                             | 一個服務整個月開著也用不完                                                        |
| 規格       | 0.1 CPU、512 MB 記憶體                                                                               | 一場十幾人的遊戲夠用                                                              |
| 隨時重啟   | Render 可能隨時重啟免費服務                                                                          | 重啟會讓進行中的房間消失（房間存在記憶體），重開一間就好                          |
| 檔案不保存 | 重新部署、重啟、休眠後，硬碟上的變更都會消失，免費方案不能掛永久硬碟                                 | Event Log（SQLite）會跟著消失，只能看當次啟動後的紀錄                             |
| 信用卡     | 官方頁面沒有明講要不要綁卡。它寫「沒加付款方式時，超過免費額度會暫停服務到月底」，表示可以不綁卡使用 | 不綁卡就不會被收費，最壞情況是超額時服務暫停                                      |

## 第一次部署

1. **開帳號**：到 <https://dashboard.render.com/register>，選「GitHub」登入最省事。
2. **讓 Render 讀得到 repo**：repo 是 `tony-hsueh/Who-s-Different`。登入時 GitHub 會問要授權哪些 repo，勾選它（或選 All repositories）。之後要改可以到 GitHub「Settings → Applications → Render」。
3. **用 Blueprint 建立服務**：Render 後台右上角「New」→「Blueprint」→ 選 `Who-s-Different` repo、分支 `main` → 「Connect」。
   - Render 會讀 `render.yaml`，列出一個叫 `whos-different` 的 web service，方案顯示 **Free**、區域 **Singapore**。確認是 Free 再按「Apply」。
   - 如果名稱 `whos-different` 已被別人用掉，Render 會在網址後面加一串字，例如 `whos-different-abcd.onrender.com`，不影響使用。
4. **等建置完成**：第一次建置要 5–10 分鐘（要編譯 Docker 映像檔）。服務頁面的「Events」顯示 **Deploy live** 就好了。
5. **確認**：
   - 打開 `https://<你的服務>.onrender.com/healthz`，看到 `{"ok":true}`。
   - 打開 `https://<你的服務>.onrender.com`，按「建立房間」，大螢幕上的連結應該是 `https://<你的服務>.onrender.com/room/XXXXXX`。
   - 用手機**關掉 Wi-Fi、改用行動網路**掃 QR Code，能加入、主持人畫面出現玩家名字，就代表 WebSocket 通了。

之後 `main` 有新的 commit，Render 會自動重新部署（`autoDeployTrigger: commit`）。部署時進行中的房間會消失，所以別在大家玩的時候合併 PR。

## 每次試玩前

1. **提早 2 分鐘喚醒**：用手機或電腦打開 `https://<你的服務>.onrender.com/healthz`，等到出現 `{"ok":true}`（睡著時大約要 1 分鐘）。
2. 主持人用筆電打開首頁、建立房間，投影 QR Code。
3. 主持人全程用同一個瀏覽器、同一個網址，換了就拿不回主持權限。
4. 遊戲結束後超過 15 分鐘沒人連，服務會自己睡著，不用手動關。

## 查 Event Log（選用）

`ADMIN_TOKEN` 由 Render 自動產生。到服務頁面「Environment」可以看到它的值，用法見 [event-log.md](event-log.md)。注意免費方案重啟或休眠後紀錄就沒了，要看請在當場玩完就查。

## 出問題時

| 狀況                                   | 處理                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 打開網址轉很久                         | 正在喚醒，等 1 分鐘再重新整理                                                                       |
| 建置失敗                               | 服務頁面「Logs」看錯誤訊息，把最後 30 行貼給 Claude                                                 |
| 玩到一半所有人斷線、房間不見           | 服務被重啟或重新部署了。重開一間房間                                                                |
| QR Code 的網址是 `localhost` 或區網 IP | 後台「Environment」裡有人手動加了 `PUBLIC_BASE_URL`。刪掉它（或改成 onrender.com 網址），再重新部署 |
| 方案不是 Free                          | 服務頁面「Settings → Instance Type」改成 Free                                                       |
