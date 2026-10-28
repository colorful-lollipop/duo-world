# 备份与恢复 Runbook

二人世界把持久化数据放在 `DATA_DIR`（默认 `<应用目录>/data`，环境变量可覆盖）：
SQLite 优先（`duo.db`），`node:sqlite` 不可用时回退到 JSON 文件（`store.json`）。
备份就围绕这两个文件做快照。

## 一键备份

仓库里自带 `scripts/backup.mjs`：

```bash
npm run backup                  # 备份到 data/backups/
npm run backup -- --verify      # 备份后打开副本，数一下每张表的行数
DATA_DIR=/opt/duo-world/data BACKUP_KEEP=30 node scripts/backup.mjs
```

脚本做的事情：

1. 对 SQLite 先执行 `PRAGMA wal_checkpoint(TRUNCATE)`，把 WAL 里的数据先落进主库再拷，
   避免直接拷贝 `.db` 漏掉最近 2 秒的事务。
2. 用 `copyFileSync` 拷贝 `duo.db`（顺带 `-wal`/`-shm`）到 `data/backups/duo-<时间戳>.db`；
   JSON 后端则拷 `store.json`。
3. 保留最近 `BACKUP_KEEP`（默认 14）份，旧的自动清理。
4. `--verify` 会打开副本统计 `rooms / journal / room_seats / room_stats` 的行数打印出来。

副本是未压缩的原始文件：出问题时可以直接用任意 SQLite 工具打开，不需要先解压。

## 每日自动备份（systemd timer）

在服务器上（以 `duoworld` 用户运行，读的是应用的数据目录）：

```ini
# /etc/systemd/system/duo-world-backup.service
[Unit]
Description=Duo World daily backup
Requires=duo-world.service
After=duo-world.service

[Service]
Type=oneshot
User=duoworld
Group=duoworld
WorkingDirectory=/opt/duo-world
ExecStart=/opt/node22/bin/node scripts/backup.mjs --verify
Environment=DATA_DIR=/opt/duo-world/data
```

```ini
# /etc/systemd/system/duo-world-backup.timer
[Unit]
Description=Run Duo World backup daily at 04:20

[Timer]
OnCalendar=*-*-* 04:20:00
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
```

```bash
systemctl daemon-reload
systemctl enable --now duo-world-backup.timer
systemctl list-timers duo-world-backup.timer
journalctl -u duo-world-backup.service -n 20   # 看最近一次备份结果
```

验证备份是否可用（重点看 `verify` 的行数是否和预期一致，比如 `journal` 有几千行）：

```bash
tail -n 30 /var/log/syslog | grep duo-world-backup
```

> 备份文件和应用数据库在同一台机器上，主机故障时没有异地冗余。
> 有需要的话把 `data/backups/` 定期 `scp/rsync` 到另一台机器或对象存储。

## 恢复演练（每季度一次，完成后在 docs/ 留档）

1. **准备一台干净的服务器/目录**，装好 Node 22，把代码 `dist + server + shared + package.json + package-lock.json` 放进去，`npm ci --omit=dev`。
2. **把最新一份备份放过去**：`scp guan:/opt/duo-world/data/backups/duo-<ts>.db <目标>/data/duo.db`。
3. **启动服务**：`NODE_ENV=production PORT=8790 node server/index.mjs`（或 systemd）。
4. **验证**：
   - `curl localhost:8790/api/health` → 200，`store` 字段存在；
   - 用原设备 token 调 `GET /api/rooms/:code/history` → 200，纪念册条数 ≥ 备份时行数；
   - 随机挑 1–2 间小屋，用 `sqlite3` 打开副本确认 `journal` 行数与 `listJournal` 一致。
5. 记录：恢复用时、验证结果、任何偏差，追加到 `docs/BACKUP.md` 末尾「演练记录」。

演练目标：从备份恢复并验证 ≤ 30 分钟。

## 常见问题

- **`wal_checkpoint(TRUNCATE)` 失败**：备份脚本会继续拷贝文件（不退出），日志里 `checkpoint` 显示 `skipped/失败`；
  这种情况下直接拷可能漏掉最近的事务，尽快手动跑一次 `sqlite3 duo.db "PRAGMA wal_checkpoint(TRUNCATE);"` 后再备。
- **JSON 回退后端**：备份的是 `store.json`，恢复时同名放回 `DATA_DIR` 即可。
- **恢复后 token 失效**：token 的 sha256 存在 `room_seats` 表里，备份/恢复不影响；
  换设备后无法通过旧 token 找回（无账号体系），这是设计内行为。
- **房间热状态**：备份的是「房间行 + 纪念册 + 战绩 + 座位」，房间里正在进行的一局（游戏快照）也在房间行里；
  恢复后游戏继续与否取决于 `rehydrate` 捞回的是未过期房间（12h TTL）。

## 演练记录

| 日期 | 用时 | 验证结果 | 备注 |
| --- | --- | --- | --- |
| （示例）2026-10-28 | 18 min | history 200，journal 行数一致 | 演练人：维护者 |
