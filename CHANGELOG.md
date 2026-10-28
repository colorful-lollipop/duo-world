# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.3.1] - 2026-10-28

### 修复

- **首页标题区溢出**：矮屏（如 1366×700、1660×730）且已有历史小屋时，
  「回到上次的小屋 / 我们的回忆 / 我的数据」三行链接会把标题区顶到玩法条下面，
  互相遮挡并吃掉底部内容。现在三行链接并排成一行，标题区限高在容器内
  （内容过多时内部滚动，不推挤其他区块），插画的圆形也改成按可用高度缩放。
- **手机页脚**：页脚法律链接被挤成竖排（「用户协 / 议」），现在整行居中显示。

### 变更

- 新增矮屏（`max-height: 800px`）布局压缩：logo 按视口高度缩放，标题/描述/按钮同步收紧。
- `scripts/visual.mjs` 新增「老用户回到首页」场景与重叠自动检查（标题区 / 插画不得压到玩法条）。

## [1.3.0] - 2026-10-28

### 新增

- **用户协议与隐私政策**：站内 `/terms`、`/privacy` 两页，文案放在 `src/lib/legal.ts`，
  首页页脚常驻入口；首次创建 / 加入小屋必须勾选同意（同意版本记在本地，改版会再问一次）。
- **我的数据（导出 / 注销）**：首页新增「我的数据」弹窗，可以按小屋导出 JSON
  （纪念册 + 战绩 + 座位昵称），也可以一键删除整间小屋的全部数据。
  对应接口 `GET /api/rooms/:code/export`、`DELETE /api/rooms/:code`，都要求本人 token。
- **一键备份**：`npm run backup`（`scripts/backup.mjs`）先 `wal_checkpoint(TRUNCATE)` 再快照到
  `data/backups/`，自带保留策略与 `--verify` 行数校验；配套运维手册 `docs/BACKUP.md`
  （含 systemd timer 与恢复演练步骤）。

### 变更

- `sitemap.xml` 收录 `/terms`、`/privacy`。
- 删除数据走 `store.purgeRoom()`：`rooms / journal / room_seats / room_stats` 四张表一起清，
  内存里的房间与防抖定时器同步清掉。

### 测试

- 单测新增 `store.purgeRoom / clearJournal` 与 `rooms.exportRoom / purgeRoom`（共 90 例）
- 烟测新增数据导出、注销以及「删完之后历史 403、房间 404」断言

## [1.2.0] - 2026-10-28

### 新增

- **🐒 哥俩好**：两人各管一只拴在同一根绳子上的猴子，轮流蓄力跳过断桥；
  跳空会挂在绳子上，同伴跳成功一次就把你拉上来，两个人都掉下去才算输。
  第 7 款游戏，走的是和其余游戏一样的插件三件套（元数据 + 服务端规则 + 客户端界面）。
- **纪念册落盘**：新增 `server/store.mjs`（`node:sqlite`，失败回退 JSON 文件），
  房间 / 纪念册 / 战绩 / 座位 token 哈希都写入数据库，重启不再丢数据。
- **历史战绩**：`GET /api/rooms/:code/history`（Bearer token）+ 新「我们的回忆」视图。
  房间大厅能翻这间小屋的全部对局，首页能翻所有待过的小屋（小屋过期了也还在），
  并展示每款游戏的胜负比分。
- **PWA**：`manifest.webmanifest` + 离线壳 `sw.js` + 192/512/apple-touch 图标，
  可以「添加到主屏幕」；`robots.txt` / `sitemap.xml` / OG 分享卡一并补上。
- **动作队列与幂等**：动作带 `cid`，服务端去重（最近 400 条）、客户端按 `ack` 出队，
  断网期间的操作会排队并在重连后自动补发。
- **渲染错误边界**：单款游戏崩溃只影响游戏区（可回大厅或重试），App 级再兜一层白屏保护。

### 测试

- 引入 **Vitest**：游戏规则单测 + 持久化 / 房间单测，`npm run test` 接入 CI
- 烟测新增「哥俩好」全流程与历史战绩接口（含错误 token 403）

## [1.1.0] - 2026-10-28

### 新增

- **13 种小动物**：新增小猪、小老鼠、小象、大河马、大野猪、驴、牛，每种都有专属造型（粉鼻、长耳、卷鼻、宽嘴、鬃毛、獠牙、花斑等）
- **心情系统**：档案新增 `mood`（平静 / 开心 / 惊喜 / 难过 / 犯困），表单实时预览，保存并同步到大厅与对局
- **生产部署**：https://love.zulogic.cn（Node 22 + systemd + OpenResty + `*.zulogic.cn` 通配符证书）

### 安全 / 可观测

- WS token 从 URL 移到首帧 `auth`，URL 不再出现长期凭证
- `helmet` + CSP + HSTS（生产环境）、HTTP 层 create/join/info 限流
- 结构化 JSON 日志（含 `x-request-id`）、`/metrics` Prometheus 指标、`/api/health` 房间数
- 详见 `docs/DEPLOY.md`

## [1.0.1] - 2026-10-28

### 变更

- 首页改为全屏「游戏标题画面」：创建 / 加入 / 玩法一览 / 怎么玩都改为弹窗，页面不再出现滚动条
- 房间与游戏页统一 `100dvh` 内部滚动，并隐藏滚动条；适配 375×667 到 1440×1100
- 弹窗、卡牌词链等内部滚动区域同样隐藏滚动条
- 补充 `docs/ROADMAP.md`：商业化与长期维护路线图
- 更新首页 / 大厅 / 跳棋截图

## [1.0.0] - 2026-10-28

### 新增

- 插件式游戏架构：
  - `server/games/index.mjs` 自动发现并校验 `server/games/<id>.mjs`
  - `src/games/registry.ts` 按需加载（code splitting）`src/games/<id>.tsx`
  - `shared/games/<id>.json` 每款游戏一份元数据驱动大厅、设置、结算与校验
  - 结算页由 `GameStageHost` 统一渲染，游戏通过 `ResultExtra` 提供补充内容
- 新游戏：**爱心跳棋**（8×8 西洋跳棋：斜走、跳吃、连跳、升王、求和、认输）
- 脚手架与校验：
  - `npm run new:game` 一键生成新游戏三件套
  - `npm run check:games` 校验元数据 / 服务端 / 界面是否齐全
- 单屏优先布局：房间与游戏页固定在视口内，内部滚动不显示滚动条，适配手机与桌面
- 分享链接自动处理：`localhost` 访问时自动换成局域网地址，支持 `PUBLIC_URL`

### 修复

- 「你懂我吗」结算阶段偶发回到答题表单的问题
- 五子棋胜场统计改为通用 `room.stats.wins` 结构

### 说明

- 房间、纪念册、统计存于内存，闲置 12 小时清理，重启清空
