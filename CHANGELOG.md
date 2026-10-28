# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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
  - `shared/games.json` 一份元数据驱动大厅、设置、结算与校验
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
