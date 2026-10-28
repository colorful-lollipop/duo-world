# AGENTS.md

二人世界（duo-world）：给两个人做的在线小游戏屋。React 18 + Vite + TypeScript 前端，Node ESM（.mjs）+ Express + ws 后端，无数据库（房间/纪念册/统计都在进程内存，单实例，闲置 12h 清理）。代码和文案大量使用中文，全部为原创实现。

## 常用命令

```bash
npm install
npm run dev        # Vite 前端 5173（host 0.0.0.0，代理 /api 和 /ws 到 8790）+ server --watch 8790
npm run build      # tsc --noEmit && node scripts/check-games.mjs && vite build
npm run serve      # build + start（http://localhost:8790）
npm run start      # 只启动服务（需要先 build 出 dist）
npm run smoke      # 端到端：起测试服务器(18790) → 双客户端跑完 6 个游戏 → 自动杀进程
npm run check:games # 只做游戏三件套结构校验
npm run new:game -- <id> <名称> [emoji] [渐变1] [渐变2]  # 新游戏脚手架
```

- Node >= 20；`package-lock.json` 已提交，CI 用 `npm ci`。
- `npm run smoke` 会把 `server/index.mjs` 起在 **18790**（`scripts/visual.mjs` 用 18791）；这两个端口被占用时测试会失败。
- 开发模式里 8790 如果存在旧 `dist` 也会被服务端托管；看前端改动请用 5173。
- 改完 `server/**` 或 `src/**` 后，以 `npm run build` + `npm run smoke` 为准；`tsc` 只检查 `src` 和 `shared`，服务端 `.mjs` 没有类型检查，靠 smoke 兜底。
- `npm run smoke` 没有「只跑某个游戏」的参数；加游戏时把流程追加到 `scripts/smoke.mjs`，否则 CI 不会覆盖它。
- UI 改动可用 `scripts/visual.mjs` 截图（需本机 Chrome + `playwright-core`，输出到 gitignored 的 `_shots/`，端口 18791；Chrome 不在默认路径时设 `CHROME_PATH`）。

## 加一个游戏（最核心的约定）

一个游戏 = 三个文件，**文件名就是游戏 id（kebab-case，必须完全一致）**，不需要改任何注册表：

| 文件 | 内容 | 约定 |
| --- | --- | --- |
| `shared/games.json` | 元数据 | 追加一条：`id/name/emoji/tagline/intro/rules/tags/duration/net/gradient/settings`。`settings` 数组自动渲染成大厅设置表单（仅支持 `select/multi/text` 三种 type）。 |
| `server/games/<id>.mjs` | 服务端规则 | **默认导出** `{ create, action, tick?, summary? }`（自动发现器只读 `mod.default`，命名导出会直接报错）。 |
| `src/games/<id>.tsx` | 客户端界面 | 导出 `export const Stage`（必填，接收 `StageProps`），可选 `export const ResultExtra`。Vite 自动拆成独立 chunk，开局才下载。 |

- 三件套缺一不可：`scripts/check-games.mjs`（`npm run build` 前置步骤）会校验，缺文件 / 缺 `export const Stage` / settings key 重复都会让构建失败。
- 服务端规则：`create(room)` 返回可 JSON 序列化的 `game.data`；`action(room, seat, action, now)` 直接改 `room.game.data`，返回 `null`=成功、字符串=给玩家的错误；`data.phase === "over"` 时服务端自动调用 `summary()` 写纪念册。
- 结算页由 `src/games/GameStageHost.tsx` **统一渲染**：它发现 `data.phase === "over"` 就渲染 `GameResult` + 游戏的 `ResultExtra`。**Stage 里不要处理 over，也不要 import `GameResult`**（会破坏按需拆包）。
- `StageProps = { room, seat, game, meta, act, send, now, subscribe }`；`act(action)` 发游戏动作，`send(msg)` 发任意 WS 消息（画板等），`now()` 是校准后的服务端时间。
- 通用工具在 `server/games/_kit.mjs`：胜场统计用 `gameWins(room, id)`（存到 `room.stats.wins[id]`，不要再造 `gomokuWins` 之类的字段）；还有 `shuffle / pickRandom / normalizeText / clampInt / otherSeat`。
- `server/games/index.mjs` 自动发现 `server/games/*.mjs`（跳过 `_` 开头和 `index`）；`src/games/registry.ts` 用 `import.meta.glob` 按需加载（负向排除 `GameStageHost.tsx` 和 `_template.tsx`，改名时要同步）。
- 模板：`server/games/_template.mjs`、`src/games/_template.tsx`；脚手架 `scripts/new-game.mjs` 已实测可用。

## 架构与网络

- 服务端权威：所有规则/计时/计分在服务端，客户端只发动作、渲染全量快照；房间两个座位，浏览器 token 识别身份，同一 token 在别处打开会接管旧连接。
- WS 连接：URL 里只有 `?code=`，**token 通过首帧 `{type:"auth", token}` 发送**（服务端 10s 内未认证或连续失败会关闭 4001）。测试/工具要连 WS 必须先发 auth。
- WS 消息类型：`auth / welcome / state / error / ink / ink-sync / reaction / ping`；动作走 `action`，游戏模块自己校验。
- 生产安全：`NODE_ENV=production` 时启用 CSP/HSTS；HTTP 层有 create/join/info 限流；`/metrics` 暴露 Prometheus 指标；`/api/health` 返回在线房间数。所有 API 请求日志带 `x-request-id`。
- 角色外观：`Profile` 含 `mood`（normal/joy/wow/sad/sleep）；小动物共 13 种，`src/lib/storage.ts` 的 `AVATARS`、`server/rooms.mjs` 的 `AVATARS/MOODS`、`src/types.ts`、`src/components/Critter.tsx` 四处要同步，服务端会校验 mood。
- 画板特殊：坐标统一 1000×1000，走独立 `ink` 通道；普通 `state` 广播会剔除 `draw-guess` 的 `strokes`（重连/开局用 `ink-sync` 全量下发）。改画板相关逻辑时注意别把整张画塞进每次快照。
- 服务端有基础限流（约 320 条/5s）和 ink 上限（约 900 笔画 / 6 万点），别依赖高频轮询。
- 部署：`PUBLIC_URL` 环境变量覆盖分享链接/二维码；本机 `localhost` 访问时 `/api/config` 会自动给局域网地址。单实例（房间在内存），要横向扩展需先换 Redis/Postgres 共享。

## 全屏布局约定

- 全局 `html, body, #root { height:100% }` 且 `body { overflow:hidden }`；首页是**全屏标题画面**（创建/加入/玩法/怎么玩都是弹窗），房间与游戏页固定 `100dvh`。
- 页面本身不要出现滚动条：内容超出时在内部容器滚动，并隐藏滚动条（`.room-main / .stage / .modal-body` 等都配了 `scrollbar-width:none`）。新增页面/区块时同样处理，并验证 `document.documentElement.scrollHeight === innerHeight`。
- 手机与桌面共用一套响应式断点（980/720/400），棋盘/画板/聊天卡按视口高度（`dvh` / `calc(100dvh - …)`）缩放，别再用固定 `aspect-ratio` 撑出滚动。

## 仓库注意事项

- `dist / node_modules / _shots / _ref` 都在 `.gitignore`，不要提交；`docs/` 里的截图是提交的。CI 在 main push / PR 上跑 Node 20 和 22 的 build + smoke。
- 版本走 `npm version X.Y.Z --no-git-tag-version` + `CHANGELOG.md` 更新 + `git tag vX.Y.Z` + `gh release create`，当前版本 1.1.0。
- 生产环境：`https://love.zulogic.cn`（服务器 `guan`，systemd 服务 `duo-world`，Node 在 `/opt/node22`，应用 `/opt/duo-world`，OpenResty vhost 反代到 127.0.0.1:8790，复用 `*.zulogic.cn` 通配符证书，`PUBLIC_URL=https://love.zulogic.cn`）。部署步骤看 `docs/DEPLOY.md`。
- 文件含中文且是 UTF-8：**不要用 PowerShell 的 `Get-Content/Set-Content` 来回读写**（会破坏编码），用文件编辑工具。
- 详细玩法、部署、扩展指南看 `README.md`；商业化路线图在 `docs/ROADMAP.md`；贡献流程看 `CONTRIBUTING.md`。
