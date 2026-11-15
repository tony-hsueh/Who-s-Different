# 部署

這個服務是**單一 Node 程序**：同一個連接埠提供網頁、WebSocket、`/healthz` 與 `/admin`。遊戲狀態在記憶體，所以只能跑一個程序，不能放在多台機器後面輪流轉送。

下面兩種做法擇一，約 15 分鐘可以跑起來：

- [A. 直接用 Node 跑](#a-直接用-node-跑)
- [B. 用 Docker 跑](#b-用-docker-跑)

再加上 [HTTPS 與 WebSocket 反向代理](#https-與-websocket-反向代理)。只在區網內玩（同一個 Wi-Fi），不需要 HTTPS，A 之後直接用 `http://區網IP:3000`。

## 環境變數

| 變數              | 預設               | 說明                                                                                                                                       |
| ----------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `PORT`            | `3000`             | 監聽的連接埠，監聽 `0.0.0.0`。                                                                                                             |
| `PUBLIC_BASE_URL` | 空                 | 對外網址，只能是來源，例如 `https://game.example.com`。有路徑、查詢字串、帳密或不是 http(s) 會讓 Server 啟動失敗。QR Code 與房間連結用它。 |
| `LOG_DB_PATH`     | `./data/events.db` | Event Log 的 SQLite 檔案。資料夾不存在會自動建立。                                                                                         |
| `ADMIN_TOKEN`     | 空                 | 設了才會啟用 `/admin/*`。請用夠長的隨機字串，例如 `openssl rand -base64 32`。                                                              |

`PUBLIC_BASE_URL` 一定要設成手機連得到的網址。沒設時 QR Code 用主持人瀏覽器網址列的網址，主持人若用 `localhost` 開，手機掃了會連不到。

## A. 直接用 Node 跑

需求：Node.js 20.19 以上、npm 10 以上、Git。`better-sqlite3` 在常見平台（例如 Linux x64、Windows x64）有預編譯檔；沒有預編譯檔的平台會從原始碼編譯，要先裝 Python 3、make 與 C++ 編譯器。

先在自己的電腦或伺服器上試跑（不需要 root，資料庫用預設的 `./data/events.db`）：

```bash
git clone https://github.com/tony-hsueh/Who-s-Different.git
cd Who-s-Different
npm ci
npm run build

export PORT=3000
export PUBLIC_BASE_URL=https://game.example.com
export ADMIN_TOKEN=$(openssl rand -base64 32)
npm start
```

確認：

```bash
curl http://localhost:3000/healthz
# {"ok":true}
```

要常駐在 Linux 伺服器上，先建立服務帳號與目錄，把程式裝到 `/opt/whos-different`，資料庫放 `/var/lib/whos-different`（服務帳號要有寫入權限，Server 只會建立不存在的資料夾，不會處理權限）：

```bash
sudo useradd --system --home-dir /opt/whos-different --shell /usr/sbin/nologin whosdifferent
sudo mkdir -p /opt/whos-different /var/lib/whos-different
sudo chown whosdifferent: /opt/whos-different /var/lib/whos-different
sudo -u whosdifferent git clone https://github.com/tony-hsueh/Who-s-Different.git /opt/whos-different
cd /opt/whos-different
sudo -u whosdifferent npm ci
sudo -u whosdifferent npm run build
echo "ADMIN_TOKEN=$(openssl rand -base64 32)" | sudo tee /etc/whos-different.env >/dev/null
sudo chmod 600 /etc/whos-different.env
```

然後用 systemd 常駐（`/etc/systemd/system/whos-different.service`）：

```ini
[Unit]
Description=Who's Different
After=network.target

[Service]
WorkingDirectory=/opt/whos-different
ExecStart=/usr/bin/node dist/server/server/index.js
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=PUBLIC_BASE_URL=https://game.example.com
Environment=LOG_DB_PATH=/var/lib/whos-different/events.db
EnvironmentFile=/etc/whos-different.env
User=whosdifferent
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

`/etc/whos-different.env` 已在上面建立（內容是 `ADMIN_TOKEN=...`，權限 `600`）。啟動：`sudo systemctl enable --now whos-different`，再用 `curl http://localhost:3000/healthz` 確認。

**更新：** 在 `/opt/whos-different` 以服務帳號執行 `git pull && npm ci && npm run build`，再 `sudo systemctl restart whos-different`。重啟會讓進行中的房間全部消失（[已知限制](known-limitations.md)），請在沒有人玩的時候更新。

## B. 用 Docker 跑

專案根目錄有 `Dockerfile`（多階段、Node 20）與 `.dockerignore`。建置階段裝編譯工具、`npm ci`、`npm run build`，再 `npm prune --omit=dev`；執行階段只帶 `node_modules`（含編譯好的 `better-sqlite3`）、`dist`，用 `node` 使用者執行，內建 `HEALTHCHECK`。

```bash
docker build -t whos-different .

docker run -d --name whos-different --restart unless-stopped \
  -p 3000:3000 \
  -e PUBLIC_BASE_URL=https://game.example.com \
  -e ADMIN_TOKEN="$(openssl rand -base64 32)" \
  -v whos-different-data:/data \
  whos-different

curl http://localhost:3000/healthz
# {"ok":true}
```

- Event Log 在容器內的 `/data/events.db`（`LOG_DB_PATH` 預設值），用 volume 保存，容器重建後仍在。
- 映像檔沒有 `tsx`，所以沒有 `npm run logs` CLI。查 Log 用 HTTP 端點（[event-log.md](event-log.md)），或 `docker cp whos-different:/data/events.db .` 把檔案複製出來，在有原始碼的機器上用 `LOG_DB_PATH=./events.db npm run logs -- --private`。
- 更新：重新 `docker build`，`docker rm -f` 舊的再 `docker run`。同樣會讓進行中的房間消失。

## HTTPS 與 WebSocket 反向代理

公開網路請放在反向代理後面，由代理處理 HTTPS。要注意的有四件事：

1. **WebSocket 要放行。** Socket.IO 走 `/socket.io/`，要轉送 `Upgrade` 與 `Connection` 標頭。
2. **保留原本的 Host 標頭。** Server 的 CSP 用請求的 `Host` 組出 `connect-src`（`ws://host wss://host`）。代理把 Host 改成內部位址，CSP 會對不上，瀏覽器可能擋掉 WebSocket。
3. **逾時要大於 Socket.IO 的心跳。** 心跳間隔是 25 秒，所以代理的讀取逾時至少 60 秒。
4. **只放一個後端。** 不要設負載平衡到多個程序。

> Caddy 與 Nginx 的範例是照官方文件寫的，作者沒有在實際的代理上跑過；上線前請照最後的「設定完成後檢查」確認。

### Caddy

Caddy 自動申請憑證，並自動處理 WebSocket 與 Host，兩行就夠：

```caddyfile
game.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

### Nginx

```nginx
map $http_upgrade $connection_upgrade {
  default upgrade;
  ''      close;
}

server {
  listen 443 ssl http2;
  server_name game.example.com;
  # ssl_certificate / ssl_certificate_key 用自己的憑證（例如 certbot）

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
  }
}
```

要限制每個 IP 的連線與請求數（程式內的限流只以單一連線計，見 [QA-07](qa/bugs.md#qa-07)），可以用 Nginx 的 `limit_conn` 與 `limit_req`，再對 `/admin` 單獨加嚴。

### 設定完成後檢查

1. `curl https://game.example.com/healthz` 回 `{"ok":true}`。
2. 打開 `https://game.example.com`，建立房間。大螢幕的 QR Code 與連結應該是 `https://game.example.com/room/XXXXXX`。
3. 手機掃 QR Code 加入，主持人名單出現玩家（代表 WebSocket 通了）。瀏覽器開發者工具 Network 可以看到 `socket.io` 的連線是 `101 Switching Protocols`。
4. 手機鎖屏再回來，仍在座位上。

## 已知的後續改善

- **`og:image` 是相對路徑。** `index.html` 寫 `/og.png`，部分社群平台（分享連結時顯示預覽圖）要求絕對網址。靜態檔不知道公開網址，後續可以讓 Server 在回 `index.html` 時，用 `PUBLIC_BASE_URL` 把它換成絕對網址。目前不影響遊戲。
- 單一程序與記憶體狀態：想水平擴充要先把房間狀態移到共用儲存（例如 Redis）並用 Socket.IO adapter，這超出目前範圍。

## 安全備忘

- `ADMIN_TOKEN` 不要提交進 repo。外洩時換一個值重啟即可。
- `/admin` 只回 Event Log，不含詞語與 Token。詞語與陣營分配只能用本機 CLI 讀。
- Server 會對房間代碼、Token 做格式與長度檢查，並對每條連線限流（每秒 10 個請求）。
