# 二人世界 · 工作交接文档

> 写于 2026-10-29，对应版本 **v1.7.0**。
> 这份文档的目标：让一个完全没参与过的人，在一小时内能跑起来、看懂结构、敢改代码、敢发布。

---

## 1. 一句话现状

给两个人做的在线小游戏屋，9 款双人游戏、无账号体系（token 即身份）、单实例部署在 `guan` 服务器，
线上地址 **https://love.zulogic.cn**，仓库 **https://github.com/colorful-lollipop/duo-world**。

| 项 | 值 |
| --- | --- |
| 当前版本 | 1.7.0（tag `v1.7.0`，GitHub Release 已发） |
| 前端 | React 18 + Vite 5 + TypeScript（`src/`，无路由库，自写 hash 无关的 path 路由） |
| 后端 | Node ESM `.mjs` + Express 4 + `ws`（`server/`） |
| 持久化 | `node:sqlite`（`server/store.mjs`），不可用时自动回退 `data/store.json` |
| 部署 | Node 22（`/opt/node22`）+ systemd `duo-world.service` + 1Panel OpenResty 反代 |
| 数据 | `/opt/duo-world/data/duo.db`（WAL），每日 04:20 由 `duo-world-backup.timer` 备份 |
| CI | GitHub Actions，Node 20/22 跑 build + test + smoke，约 40–60s |

可交付状态：P0 清单里只剩「Sentry/告警」和「备份恢复演练记录」没做完，其余已完成。

---

## 2. 十分钟跑起来

```bash
npm ci
npm run dev        # Vite 5173（host 0.0.0.0，/api 与 /ws 代理到 8790）+ server --watch 8790
```

打开 http://localhost:5173 ，创建小屋，再开一个隐身窗口用同一链接加入（两个窗口不能共用 localStorage）。

发布前必跑（顺序即依赖）：

```bash
npm run build      # tsc --noEmit && check-games && vite build
npm run test       # Vitest：11 个文件 / 169 例
npm run smoke      # 端到端：起测试服务器 18790，双客户端跑完 9 款游戏
```

常用命令全表见 `package.json` 的 `scripts`，其中容易忘的几个：

| 命令 | 作用 | 注意 |
| --- | --- | --- |
| `npm run smoke` | 全流程 e2e | 占用 18790（可用 `SMOKE_PORT` 覆盖）；`DATA_DIR` 用临时目录，跑完清理 |
| `npm run smoke:game -- <id>` | 单游戏 e2e | 只跑 `scripts/smoke/<id>.mjs`，迭代一款游戏时最快 |
| `npm run test:game -- <id>` | 单游戏单测 | 只跑 `tests/unit/<id>.test.mjs` |
| `node scripts/visual.mjs` | 截图到 `_shots/` | 占用 18791，需要本机 Chrome + `playwright-core`；包含布局重叠断言 |
| `node scripts/prod-check.mjs` | 线上巡检（真浏览器） | 直连 IP 绕过企业 DNS；会建房间、验证后再用 DELETE 清掉 |
| `npm run new:game -- <id> <名称> [emoji]` | 新游戏脚手架 | 一次生成元数据、服务端、界面、独立 CSS、单测、冒烟、单游戏文档（占位内容需要自己改）；用 `--help` 看参数 |
| `npm run assets` | 重新生成 PWA 图标 / OG 图 | 需要本机 Chrome，产物在 `public/` |
| `npm run backup` | 备份一次 | `--verify` 会数行数；`DATA_DIR` / `BACKUP_KEEP` 可覆盖 |

---

## 3. 架构总览

```
浏览器 A ──HTTP──▶ Express ──▶ rooms.mjs（房间状态机，进程内存）
浏览器 B ──WS────▶ ws server ─┘        │
                                      ├─▶ games/<id>.mjs（纯规则，无 IO）
                                      └─▶ store.mjs（SQLite / JSON 落盘）
```

原则：

1. **服务端权威**：所有规则、计时、计分在服务端；客户端只发动作、渲染全量快照。不存在“客户端自己算”。
2. **插件化游戏**：一款游戏 = `shared/games/<id>.json` + `server/games/<id>.mjs` + `src/games/<id>.{tsx,css}` + `tests/unit/<id>.test.mjs` + `scripts/smoke/<id>.mjs` + `docs/games/<id>.md`，文件名即 id，无注册表；每款可独立开发/测试，互不共享题库或样式。
3. **单实例**：房间在进程内存，SQLite 只负责恢复；横向扩展需要先把房间存储换成 Redis。
4. **无账号**：身份 = 创建/加入时拿到的一串 token（浏览器 localStorage），服务端只存 sha256。

### 目录地图

```
shared/games/<id>.json     # 每款游戏一份元数据（大厅卡片、设置 schema、SEO 文案），按 order 排序
server/
  index.mjs                # HTTP/WS 入口：安全头、限流、日志、指标、静态托管、WS 认证
  rooms.mjs                # 房间状态机（核心，2000+ 行改动都落在这里）
  store.mjs                # 唯一存储层：sqlite 优先，回退 JSON；4 张表 + 迁移
  meta.mjs                 # 读 shared/games/*.json，导出 GAME_MAP / sanitizeSettings
  observability.mjs        # 结构化日志 + Prometheus 文本指标
  games/index.mjs          # 自动发现 server/games/*.mjs（跳过 _ 开头）
  games/_kit.mjs           # 通用工具：gameWins / shuffle / pickRandom / clampInt / normalizeText
  games/_template.mjs      # 新游戏模板
  games/<id>.mjs           # 9 款游戏规则（默认导出 create/action/tick?/summary/view?）
  games/_<id>.*.mjs        # 每款游戏自己的题库 / 数值（下划线开头，自动发现器跳过）
src/
  main.tsx                 # 入口：ErrorBoundary + SW 注册（仅 PROD）
  App.tsx                  # 路由：/r/:code → RoomPage；/terms、/privacy → LegalPage；其余 HomePage
  pages/HomePage.tsx       # 全屏标题页 + 弹窗（创建/加入/玩法/怎么玩/回忆/我的数据）
  pages/RoomPage.tsx       # 加入页 + 大厅 + 游戏容器（内嵌 ErrorBoundary）
  pages/LegalPage.tsx      # 用户协议 / 隐私政策渲染器
  games/GameStageHost.tsx  # 懒加载 Stage + 统一结算页（Stage 不处理 over）
  games/registry.ts        # import.meta.glob 按需加载
  games/<id>.tsx           # 9 款游戏界面（导出 Stage，可选 ResultExtra）
  games/<id>.css           # 每款游戏自己的样式，随游戏 chunk 按需加载
  components/              # Critter（13 动物 + 5 心情）、ProfileForm、JournalView、MyData…
  lib/                     # api / storage / useRoom / router / sound / legal / consent
  styles.css               # 共用样式（基础、大厅、房间、弹窗、结算、通用组件）
tests/unit/<id>.test.mjs   # 每款游戏一份单测（+ 房间/存储）
scripts/
  smoke/<id>.mjs           # 每款游戏一份端到端
  test-game.mjs            # 单游戏单测入口
  ...                      # visual / prod-check / backup / check-games / new-game / gen-assets
public/                    # manifest、sw.js、icons、og.png、robots.txt、sitemap.xml
docs/                      # ROADMAP / DEPLOY / BACKUP + 截图
```

---

## 4. 后端细节

### 4.1 HTTP 接口

| 方法 | 路径 | 说明 | 保护 |
| --- | --- | --- | --- |
| GET | `/api/health` | `{ok,games,rooms,store,uptime}` | 无 |
| GET | `/api/config` | 分享用的公网/局域网地址 | 无 |
| GET | `/api/games` | 游戏目录 | 无 |
| POST | `/api/rooms` | 建房，body `{profile}` → `{code,seat,token,state}` | createLimiter（生产 10/min/IP） |
| POST | `/api/rooms/:code/join` | 加入 → 同上 | joinLimiter（20/min） |
| GET | `/api/rooms/:code` | 房间公开信息（谁在里面、满没满） | infoLimiter（60/min） |
| GET | `/api/rooms/:code/history` | 纪念册 + 战绩 | **Bearer**，无 token 401，别人 403 |
| GET | `/api/rooms/:code/export` | 导出该小屋全部数据 JSON | Bearer，同上 |
| DELETE | `/api/rooms/:code` | 注销该小屋（4 张表一起删） | Bearer，同上 |
| GET | `/metrics` | Prometheus 文本指标 | 无（未加鉴权） |
| GET | `/sw.js` | Service Worker，`Cache-Control: no-cache` | 无 |

统一错误体：`{code, message}`；`RoomError(code,message,status)` 是唯一的业务错误类型。

### 4.2 WebSocket 协议

连接：`/ws?code=XXXX`（**URL 里不放 token**），连上后 10 秒内必须发首帧认证：

```js
ws.send(JSON.stringify({ type: "auth", token }));
```

服务端行为：10s 未认证 → 4001 `AUTH_TIMEOUT`；房间不存在 → 4004；token 错 → 4001 `BAD_TOKEN`；
10 秒内失败 10 次 → 4001 `TOO_MANY_AUTH`。认证成功后回 `welcome`（含完整快照 + `includeInk`）。

客户端 → 服务端消息类型：`auth` `ping` `refresh` `profile` `select` `settings` `start` `exit` `action` `ink` `reaction`
服务端 → 客户端：`welcome` `state` `error` `ack` `ink` `ink-sync` `reaction` `pong`

关键约定：

- **动作幂等**：`action` 带 `cid`，服务端用 `room.seenCids`（最近 400）去重，回 `{type:'ack',cid}`；
  客户端 `useRoom` 自动加 cid、排队（上限 40），`welcome` 后补发，收到 ack 出队。断网不丢动作。
- **快照剔除笔迹**：`snapshot()` 会把 `draw-guess` 的 `strokes` 剔掉，重连/开局用 `ink-sync` 单独全量下发。
  改画板相关逻辑时千万别把整张画塞回每次 `state`。
- **限流**：每连接 5s / 320 条；ink 有笔画数与点数上限（约 900 / 6 万）。

### 4.3 房间对象（`rooms.mjs`）

```js
{
  code, createdAt, updatedAt, version,
  seats: [{ profile, token, joinedAt, ws, lastSeen } × 2],
  settings: { [gameId]: {...} },
  gameId, game: { id, run, startedAt, endedAt, data, journaled } | null,
  journal: [{ id, gameId, title, detail, data, at, code }],
  stats: { wins: { [gameId]: [seat0Wins, seat1Wins] } },
  seenCids: []
}
```

- `ROOM_TTL = 12h`，`MAX_ROOMS = 5000`，`cleanupRooms` 每 10 分钟跑一次。
- `touch()` → `markDirty()` 2 秒防抖写盘；结算、进出房间立即落盘。
- `startGame` 会 `sanitizeSettings` + `create(room)`；`handleAction` 里 `data.phase === 'over'` 时自动 `summary()` 写纪念册 + 战绩。
- 进程启动 `rehydrate()` 捞回未过期房间（`ws = null`，等客户端重连）；退出 `flushPersistence()` + `closeStore()`。
- **清理过期房间只删 `rooms` 行**，`journal / room_seats / room_stats` 永久保留 —— 这是「小屋过期了回忆还在」的实现。

### 4.4 存储（`server/store.mjs`）

零外部依赖：`createRequire` 同步加载 `node:sqlite`（Node 22 有，Node 20 没有），失败整体回退 JSON 文件（原子写 tmp→rename）。

| 表 | 主键 | 用途 |
| --- | --- | --- |
| `rooms` | `code` | 房间 JSON 快照 + `expires_at` |
| `journal` | `id` | 纪念册，索引 `(code, played_at DESC)` |
| `room_seats` | `(code, seat)` | token 哈希 + 昵称，房间过期后仍能用它验证身份 |
| `room_stats` | `code` | 胜场统计 |

- `DATA_DIR` / `DB_FILE` 环境变量可覆盖，默认 `<repo>/data`。
- 新增持久化需求**只往 store 加导出**，不要在 `rooms.mjs` 里直接写库。
- 加新表/新数据源时，记得同步 `purgeRoom()`（注销要能删干净）。

---

## 5. 加/改游戏（最核心的约定）

一款游戏 = 一组同名文件，文件名就是 id（kebab-case），互不共享题库/样式：

| 文件 | 内容 | 约定 |
| --- | --- | --- |
| `shared/games/<id>.json` | 元数据 | `order/name/emoji/tagline/intro/rules/tags/duration/net/gradient/settings`；`settings` 只支持 `select/multi/text` |
| `server/games/<id>.mjs` | 服务端规则 | **默认导出** `{create, action, tick?, summary?, view?}`；命名导出会被自动发现器忽略（还会报错） |
| `server/games/_<id>.*.mjs` | 题库 / 数值 | 下划线开头，自动发现器跳过；只被本游戏 import |
| `src/games/<id>.tsx` + `.css` | 客户端界面 + 样式 | 必须 `export const Stage`；可选 `export const ResultExtra`；CSS 由 tsx import |
| `tests/unit/<id>.test.mjs` | 单测 | `npm run test:game -- <id>` |
| `scripts/smoke/<id>.mjs` | 端到端 | 默认导出 `run(ctx)`；`npm run smoke:game -- <id>` |
| `docs/games/<id>.md` | 单游戏说明 | 只读这一篇就能改这款游戏 |

规则模块契约：

```js
create(room) -> data            // 可 JSON 序列化，必须含 phase
action(room, seat, action, now) -> null | "给玩家看的错误串"
tick(room, now) -> boolean      // 可选；返回 true 触发广播
summary(room) -> { title, detail, data? }   // phase=over 时自动调用
view(data, seat) -> data        // 可选；按座位隐藏信息（如猜词答案），broadcastState 会分别调用
```

- 结算页由 `GameStageHost` 统一渲染：**Stage 里不要处理 `phase === 'over'`，也不要 import `GameResult`**（会破坏按需拆包）。
- `StageProps = { room, seat, game, meta, act, send, now, subscribe }`。
- 胜场统计统一用 `_kit.mjs` 的 `gameWins(room, id)`，别自己造字段。
- 每款游戏独立开发：只读 `docs/games/<id>.md`，用 `npm run test:game -- <id>` / `npm run smoke:game -- <id>` 验证，不需要跑全量。
- 脚手架：`npm run new:game -- my-game 我的游戏 🎲 #fff #000`；构建前 `check-games.mjs` 会校验元数据、服务端、客户端、单测、冒烟模块齐全。

现有 9 款：`talk-cards` 深夜聊天卡、`draw-guess` 你画我猜、`mind-meld` 心有灵犀、`know-me` 你懂我吗、
`gomoku` 爱心五子棋、`checkers` 爱心跳棋、`brothers` 哥俩好（双人实时协作跳桥，各自蓄力，掉下去挂绳、可被拉回）、
`bomb-squad` 一起拆弹（信息不对称：拆弹员看面板、专家看手册，服务端 `view()` 按座位裁信息）、
`love-flight` 爱情飞行棋（掷骰跑图 + 真心话 / 小任务 / 撒娇卡）。

---

## 6. 前端约定

### 全屏、无滚动条（硬约束）

- `html, body, #root { height: 100% }`，`body { overflow: hidden }`；页面用 `100dvh` 固定高度。
- 内容超出时**在内部容器**滚动，并隐藏滚动条（`.room-main / .stage / .modal-body / .legal-body` 都配了 `scrollbar-width:none`）。
- 新页面必须验证：`document.documentElement.scrollHeight === window.innerHeight`。
- 断点：980 / 720 / 400；棋盘、画板、聊天卡按视口高度（dvh / calc）缩放，不要用固定 `aspect-ratio` 撑高。
- 矮屏（`max-height: 800px`）另有一套压缩规则（首页 hero），改首页布局时务必在 1366×700 下截图确认。

### 首页结构（容易踩坑）

`.home-screen`（flex column）→ `.home-stage`（flex:1, min-height:0）→ `.title-hero`（grid，`grid-template-rows: minmax(0,1fr)`）。
曾经出过 bug：老用户多出三行链接把标题区顶长，压住下方「7 种玩法」条。
现在链接并排在 `.title-links` 里，`.title-copy` 限高可内部滚动；`scripts/visual.mjs` 与 `prod-check.mjs` 都有重叠断言。

### PWA

- `public/` 原样进 `dist/`：`manifest.webmanifest`、`sw.js`、`icons/*`、`og.png`、`robots.txt`、`sitemap.xml`。
- `sw.js` 只缓存 GET 同源静态资源，跳过 `/api`、`/ws`、`/metrics`、`/sw.js`；**改 SW 逻辑要提升 `VERSION` 常量**。
- `index.html` 里的 `__PUBLIC_URL__` 由 `vite.config.ts` 的 `publicUrlPlugin()` 构建时替换（读 `PUBLIC_URL`，默认 `https://love.zulogic.cn`）。
- SW 只在 `import.meta.env.PROD` 注册；开发环境注册会缓存住旧 chunk。

### 健壮性

- `components/ErrorBoundary.tsx`：`main.tsx` 包整个 App（白屏兜底）；`RoomPage` 包 `GameStageHost`（单游戏崩溃只影响游戏区）。
- `lib/useRoom.ts`：WS 重连（指数退避）+ 首帧 auth + cid 队列 + `ack` 出队 + 时钟偏移。
- 头像/心情改四处要同步：`src/types.ts`、`src/lib/storage.ts`（AVATARS/MOODS）、`server/rooms.mjs`（校验）、`src/components/Critter.tsx`（造型）。当前 13 种动物、5 种心情。

---

## 7. 测试与质量

| 层 | 文件 | 覆盖 | 命令 |
| --- | --- | --- | --- |
| 单元 | `tests/unit/*.test.mjs`（11 文件 169 例） | 9 款游戏规则、store、rooms | `npm run test` |
| 端到端 | `scripts/smoke/*.mjs`（自动发现） | 双客户端跑完 9 款游戏 + 重连 + 历史/导出/注销 + token 守卫 | `npm run smoke` |
| 视觉 | `scripts/visual.mjs` | 首页（含老用户态）、协议页、大厅、9 款游戏、纪念册、我的数据；含尺寸/重叠断言 | `node scripts/visual.mjs` |
| 线上 | `scripts/prod-check.mjs` | PWA 注册、CSP 下建/加入房间、哥俩好、history/export/delete、首页重叠 | `node scripts/prod-check.mjs` |

注意：

- `visual.mjs` 与 `smoke.mjs` 都自己 spawn 服务器，**必须基于最新的 `dist/`**（它们托管 `dist` 而不是 dev server）。改完前端先 `npm run build` 再截图，否则看到的还是旧样式（这个坑踩过）。
- `smoke` 的 18790、`visual` 的 18791 被占用会失败。
- 测试数据都用 `mkdtemp` 临时 `DATA_DIR`，不会污染 `data/`。
- CI 在 `.github/workflows/ci.yml`：Node 20/22 × (build → test → smoke)。

---

## 8. 部署与运维

### 生产拓扑

```
用户 ──HTTPS──▶ OpenResty（1Panel 容器 8b3dd7e49a3d，443 → stream → 127.0.0.1:9443 proxy_protocol）
                 └─ vhost love.zulogic.cn → proxy_pass http://127.0.0.1:8790
                                                           │
                                          systemd duo-world.service（User=duoworld，Node /opt/node22）
```

| 项 | 值 |
| --- | --- |
| 服务器 | `ssh guan`，154.89.148.238:26475，Ubuntu 22.04 |
| 应用目录 | `/opt/duo-world`（tar 部署，不是 git checkout） |
| Node | `/opt/node22`（独立安装；**系统 node 是 v12，不能用**） |
| npm 调用 | `/opt/node22/bin/node /opt/node22/lib/node_modules/npm/bin/npm-cli.js ci ...`（直接 `npm` 会报 `Cannot find module 'node:path'`） |
| 服务 | `duo-world.service`（`NODE_ENV=production PORT=8790 HOST=127.0.0.1 PUBLIC_URL=https://love.zulogic.cn`） |
| vhost | `/opt/1panel/www/conf.d/love.zulogic.cn.conf` → 代理 `/opt/1panel/www/sites/love.zulogic.cn/proxy/root.conf` |
| 证书 | `*.zulogic.cn`，`/opt/1panel/www/ssl/zulogic.cn/{fullchain,privkey}.pem`，**2026-12-26 到期** |
| 数据 | `/opt/duo-world/data/duo.db`（WAL）+ `data/backups/` |
| 备份 | `duo-world-backup.timer` 每天 04:20（`journalctl -u duo-world-backup.service`） |

### 发布命令（本地 → 线上）

```bash
npm run build
tar -czf duo-deploy.tar.gz dist server shared package.json package-lock.json scripts/backup.mjs
scp duo-deploy.tar.gz guan:/tmp/duo-deploy.tar.gz
ssh guan "cd /opt/duo-world && rm -rf dist server shared scripts/backup.mjs \
  && tar -xzf /tmp/duo-deploy.tar.gz -C /opt/duo-world \
  && /opt/node22/bin/node /opt/node22/lib/node_modules/npm/bin/npm-cli.js ci --omit=dev --no-audit --no-fund \
  && chown -R duoworld:duoworld /opt/duo-world \
  && systemctl restart duo-world && sleep 3 && systemctl is-active duo-world \
  && curl -fsS http://127.0.0.1:8790/api/health"
```

**不要动 `data/`**：不在 tar 里，也不会被 `rm -rf` 波及；`chown -R` 会顺带修好权限（`data/backups` 曾被 root 创建导致 timer 失败）。

发布后：

```bash
node scripts/prod-check.mjs     # 真浏览器巡检（CSP / SW / WS / history / export / delete / 首页布局）
curl -I https://love.zulogic.cn/
```

### 常见故障排查

| 现象 | 原因 / 处理 |
| --- | --- |
| 页面还是旧的 | Service Worker 缓存；硬刷新或关标签重开；`sw.js` 已是 no-cache，`VERSION` 提升可强制换缓存 |
| `npm ci` 报 `Cannot find module 'node:path'` | 用了系统 node 12 / 错误的 npm，改用 `/opt/node22/...` 全路径 |
| 备份 service 失败 `EACCES copyfile` | `data/backups` 属主不是 duoworld，`chown -R duoworld:duoworld /opt/duo-world/data` |
| 本机 curl 解析到 198.18.x | 企业 DNS 劫持，用 `curl --resolve love.zulogic.cn:443:154.89.148.238` |
| 重启后房间变少 | `rehydrate()` 只捞**未过期**房间（12h TTL），属预期 |
| 端口占用导致 smoke/visual 失败 | 18790 / 18791 被占，先杀掉残留 node |
| 中文乱码 | 仓库文件是 UTF-8，**不要用 PowerShell 的 `Get-Content/Set-Content` 读写**，用编辑器/文件工具 |

---

## 9. 发布流程（每次都要走完）

1. 改代码 → `npm run build && npm run test && npm run smoke`（必要时 `node scripts/visual.mjs` 看截图）
2. 更新 `CHANGELOG.md`（新增/修复/变更/测试四段）、必要时 `README.md` / `AGENTS.md`（版本号在「仓库注意事项」里）
3. `npm version X.Y.Z --no-git-tag-version`（注意：会改 `package.json` 与锁文件）
4. `git add -A && git commit && git push origin main`
5. 按第 8 节部署 → `node scripts/prod-check.mjs`
6. `git tag -a vX.Y.Z -m "duo-world vX.Y.Z" && git push origin vX.Y.Z`
7. 写 release notes 文件 → `gh release create vX.Y.Z --title "二人世界 vX.Y.Z" --notes-file xxx.md` → **删除临时 notes 文件**
8. 确认 CI 绿：`gh run list --limit 1`

> 上一轮踩过的坑：`git add -A` 把 `duo-deploy.tar.gz` 和 `release-notes-*.md` 一起提交了。现在 `.gitignore` 已加 `*.tar.gz`，notes 文件发布后记得删。

---

## 10. 这段工作的时间线（谁做了什么）

| 版本 | 内容 |
| --- | --- |
| v1.0.0 / v1.0.1 | 开源首发：6 款游戏、插件化三件套、全屏单页、CI、Issue/PR 模板、MIT |
| v1.1.0 | 13 种小动物 + 5 种心情；WS 首帧认证；helmet/CSP/HSTS + 限流；结构化日志 + `/metrics`；**首次上线 love.zulogic.cn** |
| v1.2.0 | 第 7 款游戏「哥俩好」；SQLite 持久化（`store.mjs`）+ 历史战绩 + 「我们的回忆」；动作 cid/ack 队列；错误边界；PWA/OG/SW；Vitest 84 例接入 CI |
| v1.3.0 | 用户协议 + 隐私政策 + 首次同意；「我的数据」导出/注销（`/export`、`DELETE`）；一键备份脚本 + systemd timer + `docs/BACKUP.md`；单测 90 例 |
| v1.3.1 | 修首页矮屏溢出（老用户三行链接被玩法条遮住）；视觉脚本加「老用户回首页」场景与重叠断言 |
| v1.4.0 | 每款游戏完全解耦（元数据 / 题库 / 独立 CSS / 单测 / 冒烟 / 文档各自一份）；新增 `view(data, seat)` 按座位藏信息；画猜、聊天卡、默契题库扩容；哥俩好改实时双人 |
| v1.4.1 / v1.4.2 | 聊天卡手机端紧凑布局；哥俩好移除落点预览，只保留蓄力条 |
| v1.5.0 | 新增第 8 款「一起拆弹」（信息不对称合作）与第 9 款「爱情飞行棋」（掷骰 + 真心话 / 小任务 / 撒娇卡）；修 `npm run test:game` 在 Windows + Node 20+ 的 spawn 失败；视觉脚本覆盖两款新游戏 |
| v1.6.0 | 哥俩好延迟图标、60fps/本地跳跃预测、绳子 300 上限与拖拽、连点救援、金币、游戏文字防误选 |
| v1.7.0 | 哥俩好绳子拉回补间、同时起跳广播合并与舞台防复制；爱情飞行棋天空地图 / 双 SVG 飞机 / 逐格移动动画；爱心跳棋人话规则 |

---

## 11. 已知限制（不是 bug，是设计/成本取舍）

1. **单实例**：房间在内存 + 本地 SQLite；多实例需 Redis 广播 + Postgres。
2. **token 即身份**：换设备/清缓存后无法找回纪念册（没有账号体系）；这是「不用注册」的代价。
3. **没有语音**；文字聊天只在「深夜聊天卡」里，其他游戏只有表情反应；你画我猜不留存画作原图。
4. **`/metrics` 无鉴权**，仅适合内网或反代层限制来源。
5. **没有告警**：只有日志与指标，出错要人肉看 `journalctl`。
6. **备份不异地**：与应用同机，主机故障会同时丢。
7. **证书到期 2026-12-26**，需要手动续期替换。
8. 移动端未做横屏提示、无震动反馈；键盘可玩性只覆盖了哥俩好（空格蓄力）。

---

## 12. 路线图剩余（按建议优先级）

| 优先级 | 事项 | 说明 |
| --- | --- | --- |
| P0 收尾 | Sentry / 错误告警 | 现在只有结构化日志；可先接 UptimeRobot 打 `/api/health`，再接 webhook |
| P0 收尾 | 备份恢复演练记录 | 按 `docs/BACKUP.md` 走一遍，把用时与结果填进「演练记录」表 |
| P1 | 纪念册长图 / PDF 导出 | Canvas 拼一张「我们玩过的 N 局」分享图，配合现有 og.png |
| P1 | 情侣绑定（固定小屋） | 记住固定房间、一键开局，省掉每次输码 |
| P1 | 无障碍与键盘 | 棋盘键盘可玩、`aria-live` 播报轮到谁、对比度、`prefers-color-scheme` |
| P1 | 每日一问 / 每周回顾 | 复用 `talkCards` 题库 + 定时任务（需要账号或本地推送） |
| P2 | 账号体系 / 权益 / 支付 | 见 `docs/ROADMAP.md` 阶段 2，属于产品化大改 |
| P2 | 多实例与 CDN | 房间状态外置、静态资源上 CDN |

---

## 13. 接手 checklist（建议第一周）

- [ ] `npm ci && npm run dev`，两个浏览器窗口跑一局五子棋，确认 WS 正常
- [ ] `npm run build && npm run test && npm run smoke` 三条全绿
- [ ] 读 `server/rooms.mjs` 的 `createRoom / handleAction / finalizeIfOver / historyFor / purgeRoom`
- [ ] 读 `src/games/GameStageHost.tsx` + 任意一款 `src/games/*.tsx`，理解 `StageProps`
- [ ] `npm run new:game -- demo 示例游戏 🎈` 走一遍脚手架，跑 `check-games`
- [ ] `ssh guan` 看 `systemctl status duo-world`、`journalctl -u duo-world -n 50`、`ls data/backups`
- [ ] `node scripts/prod-check.mjs` 确认生产健康
- [ ] 跑一次 `npm run backup -- --verify`，理解备份产物

---

## 14. 关键决策记录（为什么这么做）

| 决策 | 原因 |
| --- | --- |
| 不做账号，token 即身份 | 情侣双人场景，降低上手成本；代价是换设备丢失身份，用「导出/删除」补数据权 |
| 房间在内存 + SQLite 落盘 | 单实例够用，规则逻辑全是同步内存操作，简单且不易出竞态 |
| 服务端权威 + 全量快照 | 双方视角一致，重连即恢复；游戏模块只写纯函数 |
| 一款游戏三件套、文件名即 id | 加游戏零注册成本，Vite 自动拆 chunk，首屏只加载大厅 |
| `node:sqlite` 而非 better-sqlite3 | 零原生依赖，部署与 CI（Node 20/22）都省事；Node 20 自动回退 JSON |
| 首帧 auth 而非 URL token | token 不进 URL / 反代日志 / Referer |
| 中文文案写死在源码 | 当前只面向中文用户，i18n 留到真正需要时 |

---

*文档维护：结构性变更（新增游戏体系、换存储、换部署方式）时同步更新本文件与 `AGENTS.md`。*
