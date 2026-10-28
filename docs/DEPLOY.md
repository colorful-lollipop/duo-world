# 部署记录 · love.zulogic.cn

当前生产环境：

- URL：**https://love.zulogic.cn**
- 服务器：`guan`（154.89.148.238:26475，Ubuntu 22.04）
- 应用目录：`/opt/duo-world`
- Node：`/opt/node22`（独立安装的 Node 22，不动系统 Node 12）
- 进程：systemd `duo-world.service`，监听 `127.0.0.1:8790`
- 反向代理：1Panel 的 OpenResty 容器，vhost `love.zulogic.cn`
- 证书：复用 `*.zulogic.cn` 通配符证书（`/opt/1panel/www/ssl/zulogic.cn/`）
- 环境变量：`NODE_ENV=production`、`PORT=8790`、`HOST=127.0.0.1`、`PUBLIC_URL=https://love.zulogic.cn`

## 日常发布

本地构建并打包：

```bash
npm ci
npm run build
tar -czf duo-deploy.tar.gz dist server shared package.json package-lock.json
scp duo-deploy.tar.gz guan:/tmp/duo-deploy.tar.gz
```

服务器更新：

```bash
ssh guan
cd /opt/duo-world
rm -rf dist server shared
tar -xzf /tmp/duo-deploy.tar.gz -C /opt/duo-world
/opt/node22/bin/node /opt/node22/lib/node_modules/npm/bin/npm-cli.js ci --omit=dev --no-audit --no-fund
chown -R duoworld:duoworld /opt/duo-world
systemctl restart duo-world
systemctl is-active duo-world
curl -fsS http://127.0.0.1:8790/api/health
```

> 注意：服务器 PATH 里的 `node` 是 v12，`npm` 必须用 `/opt/node22/bin/node .../npm-cli.js` 调用，直接 `npm ci` 会报 `Cannot find module 'node:path'`。

## OpenResty / HTTPS

vhost：`/opt/1panel/www/conf.d/love.zulogic.cn.conf`
反代：`/opt/1panel/www/sites/love.zulogic.cn/proxy/root.conf`

```nginx
# 关键部分
server_name love.zulogic.cn;
listen 80;
listen 127.0.0.1:9443 ssl proxy_protocol;   # 443 stream 默认转到 9443
ssl_certificate     /www/ssl/zulogic.cn/fullchain.pem;
ssl_certificate_key /www/ssl/zulogic.cn/privkey.pem;
location ^~ / {
    proxy_pass http://127.0.0.1:8790;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $http_connection;
}
```

测试与重载：

```bash
docker exec 8b3dd7e49a3d /usr/local/openresty/nginx/sbin/nginx -t
docker exec 8b3dd7e49a3d /usr/local/openresty/nginx/sbin/nginx -s reload
```

证书是 `*.zulogic.cn` 通配符，到期前需要续期并替换 `/opt/1panel/www/ssl/zulogic.cn/{fullchain,privkey}.pem`。

## 验证

```bash
curl -I https://love.zulogic.cn/
curl https://love.zulogic.cn/api/health
curl https://love.zulogic.cn/metrics
```

WebSocket 验证要按首帧认证：

```js
const ws = new WebSocket(`wss://love.zulogic.cn/ws?code=${code}`);
ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token }));
```

## 回滚

```bash
ssh guan
cd /opt/duo-world
git status            # 若服务器上是 git checkout，可直接 git checkout <tag>
# 或重新上传上一版 tar
systemctl restart duo-world
```

当前目录不是 git checkout（是 tar 部署），回滚需保留上一版 tar 或重新从 GitHub Release 构建。

## 数据持久化与备份

- 数据在 `/opt/duo-world/data/duo.db`（SQLite，WAL 模式）；部署脚本只覆盖 `dist server shared`，**不会动 `data/`**，所以发布、重启都不丢纪念册和战绩。
- 房间热状态 2 秒防抖落盘、结算瞬间写库；退出前 `flushPersistence()` + `wal_checkpoint`。
- 清理过期房间时只删 `rooms` 表的行，`journal / room_seats / room_stats` 永久保留（这是「小屋过期了回忆还在」的实现方式）。

### 每日备份

仓库自带备份脚本（先 checkpoint 再拷，避免漏 WAL 里还没落盘的事务）：

```bash
ssh guan "cd /opt/duo-world && /opt/node22/bin/node scripts/backup.mjs --verify"
# 输出备份文件名、字节数、保留策略，以及每张表的行数
ls -lh /opt/duo-world/data/backups | tail -3
```

用 systemd timer 每天跑一次（完整 unit 文件、保留策略、恢复演练步骤见
[docs/BACKUP.md](BACKUP.md)）：

```ini
# /etc/systemd/system/duo-world-backup.service
[Service]
Type=oneshot
User=duoworld
WorkingDirectory=/opt/duo-world
ExecStart=/opt/node22/bin/node scripts/backup.mjs --verify
Environment=DATA_DIR=/opt/duo-world/data
```

```bash
systemctl daemon-reload && systemctl enable --now duo-world-backup.timer
systemctl list-timers duo-world-backup.timer
```

- 备份留在 `data/backups/`（默认最近 14 份），量级很小：一条记录几 KB，服务器磁盘 68G / 剩 28G。
- 主机故障时没有异地冗余，需要的话把 `data/backups/` 定期同步到别的机器或对象存储。
