# AGENTS.md

二人世界（duo-world）：给两个人做的在线小游戏屋。React 18 + Vite + TypeScript 前端，Node ESM（.mjs）+ Express + ws 后端；**9 款游戏**；状态在进程内存，落盘用 `node:sqlite`（`server/store.mjs`，无外部依赖，失败回退 JSON 文件），单实例，房间闲置 12h 清理但纪念册/战绩永久保留。代码和文案大量使用中文，全部为原创实现。

## 常用命令

```bash
npm install
npm run dev        # Vite 前端 5173（host 0.0.0.0，代理 /api 和 /ws 到 8790）+ server --watch 8790
npm run build      # tsc --noEmit && node scripts/check-games.mjs && vite build
npm run serve      # build + start（http://localhost:8790）
npm run start      # 只启动服务（需要先 build 出 dist）
npm run smoke      # 端到端：起测试服务器(18790) → 双客户端跑完 9 个游戏 → 自动杀进程
npm run smoke:game -- <id>  # 只跑一款游戏的端到端（端口可用 SMOKE_PORT 覆盖）
npm run test       # Vitest 单测（tests/unit：各游戏规则 + store + rooms）
npm run test:game -- <id>   # 只跑一款游戏的单测
npm run check:games # 只做游戏结构校验
npm run assets     # 重新生成 PWA 图标 / OG 图（scripts/gen-assets.mjs，需要本机 Chrome）
npm run backup     # 数据备份（scripts/backup.mjs，先 checkpoint 再快照到 data/backups/）
npm run new:game -- <id> <名称> [emoji] [渐变1] [渐变2]  # 新游戏脚手架
```

- Node >= 20；`package-lock.json` 已提交，CI 用 `npm ci`。
- `npm run smoke` 会把 `server/index.mjs` 起在 **18790**（`scripts/visual.mjs` 用 18791）；这两个端口被占用时测试会失败。
- 开发模式里 8790 如果存在旧 `dist` 也会被服务端托管；看前端改动请用 5173。
- 改完 `server/**` 或 `src/**` 后，以 `npm run build` + `npm run smoke` 为准；`tsc` 只检查 `src` 和 `shared`，服务端 `.mjs` 没有类型检查，靠 smoke 兜底。
- 冒烟按游戏拆分：`scripts/smoke/<id>.mjs` 默认导出 `run(ctx)`，加游戏时脚手架会生成，不要再去改 `scripts/smoke.mjs` 主入口。
- UI 改动可用 `scripts/visual.mjs` 截图（需本机 Chrome + `playwright-core`，输出到 gitignored 的 `_shots/`，端口 18791；Chrome 不在默认路径时设 `CHROME_PATH`）。

## 加一个游戏（最核心的约定）

一个游戏 = **六个文件 + 一篇只讲它自己的文档**，文件名就是游戏 id（kebab-case，必须完全一致），不需要改任何注册表；每一款都可以单独开发、单独测试、单独发布，改 A 游戏不会碰到 B 游戏的文件：

| 文件 | 内容 | 约定 |
| --- | --- | --- |
| `shared/games/<id>.json` | 元数据 | `order/name/emoji/tagline/intro/rules/tags/duration/net/gradient/settings`。`settings` 数组自动渲染成大厅设置表单（仅支持 `select/multi/text` 三种 type）。目录里每个 json 自动发现，按 `order` 排序。 |
| `server/games/<id>.mjs` | 服务端规则 | **默认导出** `{ create, action, tick?, summary?, view? }`（自动发现器只读 `mod.default`，命名导出会直接报错）。 |
| `server/games/_<id>.*.mjs` | 题库 / 数值（可选） | 下划线开头，自动发现器会跳过；只被这款游戏 import。 |
| `src/games/<id>.tsx` | 客户端界面 | 导出 `export const Stage`（必填，接收 `StageProps`），可选 `export const ResultExtra`。 |
| `src/games/<id>.css` | 界面样式 | 在 tsx 里 `import "./<id>.css"`，Vite 会拆成这款游戏的按需 CSS chunk；不要写进 `src/styles.css`。 |
| `tests/unit/<id>.test.mjs` | 单元测试 | `npm run test:game -- <id>` 只跑它。 |
| `scripts/smoke/<id>.mjs` | 端到端 | 默认导出 `run(ctx)`；`npm run smoke:game -- <id>` 只跑它。 |
| `docs/games/<id>.md` | 单游戏说明 | 数据形状、动作、坑点、测试命令；subagent 只读这一篇就能开工。 |

- 这套结构缺一不可：`scripts/check-games.mjs`（`npm run build` 前置步骤）会校验元数据 / 服务端 / 客户端 / 单测 / 冒烟模块，缺文件 / 缺 `export const Stage` / settings key 重复都会让构建失败。
- 脚手架 `npm run new:game -- <id> <名称> [emoji] [渐变1] [渐变2]` 会一次生成上面七个文件（含单测、冒烟、独立 CSS、单游戏文档），不需要手工登记。
- 服务端规则：`create(room)` 返回可 JSON 序列化的 `game.data`；`action(room, seat, action, now)` 直接改 `room.game.data`，返回 `null`=成功、字符串=给玩家的错误；`data.phase === "over"` 时服务端自动调用 `summary()` 写纪念册。
- 需要按座位藏信息（例如猜词答案、对手的候选词）时，在服务端导出 `view(data, seat)`，返回给该座位的浅拷贝；`broadcastState` 会对每个座位分别调用。不要只在客户端藏。
- 结算页由 `src/games/GameStageHost.tsx` **统一渲染**：它发现 `data.phase === "over"` 就渲染 `GameResult` + 游戏的 `ResultExtra`。**Stage 里不要处理 over，也不要 import `GameResult`**（会破坏按需拆包）。
- `StageProps = { room, seat, game, meta, act, send, now, subscribe }`；`act(action)` 发游戏动作，`send(msg)` 发任意 WS 消息（画板等），`now()` 是校准后的服务端时间。
- 通用工具在 `server/games/_kit.mjs`：胜场统计用 `gameWins(room, id)`（存到 `room.stats.wins[id]`，不要再造 `gomokuWins` 之类的字段）；还有 `shuffle / pickRandom / normalizeText / clampInt / otherSeat`。
- `server/games/index.mjs` 自动发现 `server/games/*.mjs`（跳过 `_` 开头和 `index`）；`src/games/registry.ts` 用 `import.meta.glob` 按需加载（负向排除 `GameStageHost.tsx` 和 `_template.tsx`，改名时要同步）。
- 模板：`server/games/_template.mjs`、`src/games/_template.tsx`；脚手架 `scripts/new-game.mjs` 已实测可用。

### 单游戏开发闭环（subagent 推荐姿势）

```bash
npm run test:game -- brothers   # 只跑这一款：改完立刻知道规则有没有坏
npm run smoke:game -- brothers  # 只起一台服务器，双客户端跑这一款
npm run build                   # 只在你准备合入前跑
```

只读 `docs/games/<id>.md` + 本节的通用约定即可开工；不要改别的游戏的 `src/games/<other>.*`、`server/games/<other>.mjs`、`shared/games/<other>.json`。公共代码（`_kit.mjs`、`components/`、`styles.css`）改动要慎重，能写进自己文件就别动公共层。

## 架构与网络

- 服务端权威：所有规则/计时/计分在服务端，客户端只发动作、渲染全量快照；房间两个座位，浏览器 token 识别身份，同一 token 在别处打开会接管旧连接。
- WS 连接：URL 里只有 `?code=`，**token 通过首帧 `{type:"auth", token}` 发送**（服务端 10s 内未认证或连续失败会关闭 4001）。测试/工具要连 WS 必须先发 auth。
- WS 消息类型：`auth / welcome / state / error / ink / ink-sync / reaction / ping / ack`；动作走 `action`（带 `cid`），游戏模块自己校验。
- **动作幂等**：客户端 `send({type:"action", ...})` 会自动加 `cid` 并入队；服务端用 `room.seenCids`（最近 400 条）去重，回 `{type:"ack", cid}`；客户端收到 ack 出队，重连（welcome）后补发未确认的动作。断网期间动作不会丢，客户端据此实现「离线排队」。
- **持久化**：`server/store.mjs` 是唯一的存储层（sqlite 优先，Node 20 无 `node:sqlite` 时自动回退 `data/store.json`）。`rooms.mjs` 里 `touch()` → `markDirty()` 2s 防抖落盘；`finalizeIfOver` 同步写 journal + stats；`cleanupRooms` 只删房间行，**保留** journal / seats / stats；启动 `rehydrate()` 捞回未过期房间（`ws=null`）；退出走 `flushPersistence()` + `closeStore()`。新增持久化需求请走 store 的导出，别在 rooms.mjs 里直接写库。
- **历史战绩**：`GET /api/rooms/:code/history` 需要 `Authorization: Bearer <token>`（无 token 401，别人的 token 403）；房间过期也能查，靠 `room_seats` 里的 token 哈希。前端 `src/components/JournalView.tsx` 是唯一的纪念册视图（房间大厅 + 首页「我们的回忆」共用），`live` 参数用于合并当前房间内存里的条目。
- **法务与数据权**：文案在 `src/lib/legal.ts`（`LEGAL_TERMS` / `LEGAL_PRIVACY`，`CONSENT_VERSION` 有实质变更时改），页面是 `/terms`、`/privacy`；首次建/加入小屋要勾选同意（`src/lib/consent.ts` 记本地版本）。数据权接口：`GET /api/rooms/:code/export`（导出 JSON）、`DELETE /api/rooms/:code`（整间小屋的 rooms/journal/seats/stats 一起删，走 `store.purgeRoom`）；首页「我的数据」弹窗（`src/components/MyData.tsx`）包了这两个。加新的可删除数据源时，记得同步 `store.purgeRoom`。
- **备份**：`scripts/backup.mjs`（`npm run backup`）先 `wal_checkpoint(TRUNCATE)` 再快照到 `data/backups/`，保留 `BACKUP_KEEP` 份，`--verify` 数行数；运维 runbook 在 `docs/BACKUP.md`。
- 生产安全：`NODE_ENV=production` 时启用 CSP/HSTS；HTTP 层有 create/join/info 限流；`/metrics` 暴露 Prometheus 指标；`/api/health` 返回在线房间数。所有 API 请求日志带 `x-request-id`。
- 角色外观：`Profile` 含 `mood`（normal/joy/wow/sad/sleep）；小动物共 13 种，`src/lib/storage.ts` 的 `AVATARS`、`server/rooms.mjs` 的 `AVATARS/MOODS`、`src/types.ts`、`src/components/Critter.tsx` 四处要同步，服务端会校验 mood。
- 画板特殊：坐标统一 1000×1000，走独立 `ink` 通道；普通 `state` 广播会剔除 `draw-guess` 的 `strokes`（重连/开局用 `ink-sync` 全量下发）。改画板相关逻辑时注意别把整张画塞进每次快照。
- 服务端有基础限流（约 320 条/5s）和 ink 上限（约 900 笔画 / 6 万点），别依赖高频轮询。
- 部署：`PUBLIC_URL` 环境变量覆盖分享链接/二维码；本机 `localhost` 访问时 `/api/config` 会自动给局域网地址。单实例（房间在内存），要横向扩展需先换 Redis/Postgres 共享。

## 全屏布局约定

- 全局 `html, body, #root { height:100% }` 且 `body { overflow:hidden }`；首页是**全屏标题画面**（创建/加入/玩法/怎么玩都是弹窗），房间与游戏页固定 `100dvh`。
- 页面本身不要出现滚动条：内容超出时在内部容器滚动，并隐藏滚动条（`.room-main / .stage / .modal-body` 等都配了 `scrollbar-width:none`）。新增页面/区块时同样处理，并验证 `document.documentElement.scrollHeight === innerHeight`。
- 手机与桌面共用一套响应式断点（980/720/400），棋盘/画板/聊天卡按视口高度（`dvh` / `calc(100dvh - …)`）缩放，别再用固定 `aspect-ratio` 撑出滚动。

## PWA / 静态资源

- `public/` 里的东西会原样进 `dist/`：`manifest.webmanifest`、`sw.js`（离线壳）、`icons/*`（192 / 512 / maskable / apple-touch）、`og.png`（分享卡）、`robots.txt`、`sitemap.xml`、`favicon.svg`。
- 图标与 OG 图由 `scripts/gen-assets.mjs` 生成（本机 Chrome + canvas），改文案后跑 `npm run assets` 重新出图，不要手工替换。
- `sw.js` 只缓存 GET 同源静态资源；`/api`、`/ws`、`/metrics`、`/sw.js` 一律跳过。服务端给 `/sw.js` 单独设了 `no-cache`，其余静态资源 `max-age=1h`；改完 sw 记得提升 `VERSION` 常量让旧缓存失效。
- `index.html` 里的 `__PUBLIC_URL__` 由 `vite.config.ts` 的 `publicUrlPlugin()` 在构建时替换（读 `PUBLIC_URL` 环境变量，默认 `https://love.zulogic.cn`），OG / canonical 必须是绝对地址。
- SW 注册在 `src/main.tsx`，只在 `import.meta.env.PROD` 且浏览器支持时注册；开发环境不要注册，否则会缓存住旧 chunk。
- manifest 的 `shortcuts` 用 `/?action=create|join`，`HomePage` 会读这个 query 直接开对应弹窗（读后 `history.replaceState` 清掉）。

## 渲染健壮性

- `src/components/ErrorBoundary.tsx`：`main.tsx` 里包住整个 App（白屏兜底），`RoomPage` 里再包一层 `GameStageHost`（单款游戏崩溃只影响游戏区，可「回大厅」或「再试一次」）。新增可能抛错的渲染逻辑时，把边界包在最靠近出错点的地方。
- 结算页由 `GameStageHost` 统一渲染，Stage 不需要处理 `phase === "over"`。

## 仓库注意事项

- `dist / node_modules / _shots / _ref / data` 都在 `.gitignore`，不要提交（`data/` 是运行时的 SQLite 与回退 JSON，属于用户数据）；`docs/` 里的截图是提交的。CI 在 main push / PR 上跑 Node 20 和 22 的 build + test + smoke。
- 版本走 `npm version X.Y.Z --no-git-tag-version` + `CHANGELOG.md` 更新 + `git tag vX.Y.Z` + `gh release create`，当前版本 1.6.0。
- 生产环境：`https://love.zulogic.cn`（服务器 `guan`，systemd 服务 `duo-world`，Node 在 `/opt/node22`，应用 `/opt/duo-world`，OpenResty vhost 反代到 127.0.0.1:8790，复用 `*.zulogic.cn` 通配符证书，`PUBLIC_URL=https://love.zulogic.cn`）。部署步骤看 `docs/DEPLOY.md`。
- 文件含中文且是 UTF-8：**不要用 PowerShell 的 `Get-Content/Set-Content` 来回读写**（会破坏编码），用文件编辑工具。
- 详细玩法、部署、扩展指南看 `README.md`；商业化路线图在 `docs/ROADMAP.md`；贡献流程看 `CONTRIBUTING.md`。
