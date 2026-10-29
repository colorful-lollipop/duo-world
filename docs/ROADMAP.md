# 二人世界 · 商业化交付优化路线图

> 版本：v1.0 ｜ 日期：2026-10-28 ｜ 适用代码：`duo-world` v1.0.0
> 目标：把当前「可玩的技术原型」升级为**可公开运营、可收费、可运维、可扩展**的商业产品。

---

## 0. TL;DR

**现状**：架构底子很好（服务端权威、双人房间、6 款完整游戏、协议级 e2e smoke、Docker + CI），但缺的是商业产品必需的"外围"：持久化、账号、监控、测试、安全加固、PWA、增长与合规。

**距商业交付的四个硬缺口**：

1. **数据会丢**——房间、纪念册、胜负记录全在内存，重启即清零。
2. **不可观测**——没有日志规范、指标、告警、错误上报，线上出问题只能靠用户反馈。
3. **不可增长**——没有账号体系、分享卡片、SEO、埋点，用户来了留不住也带不来。
4. **不可收费**——没有权益体系、支付、订单、退款、发票。

**建议节奏**：先花 4–6 周补齐"可交付基线"（P0），再花 6–8 周做留存（P1），最后 8–12 周做账号与商业化（P2）。单人全职约 5–7 个月；两人并行约 3–4 个月。

**两周内立刻能做的 10 件事**见 [第 9 节](#9-两周内可完成的-10-件事)。

### 进度（2026-10-28，v1.3.0）

| 项 | 状态 |
| --- | --- |
| 0.1 持久化（SQLite + 回退 JSON） | ✅ v1.2.0 |
| 0.2 WS 首帧认证 | ✅ v1.1.0 |
| 0.3 安全头 + 限流 | ✅ v1.1.0 |
| 0.4 可观测（日志 / metrics / health） | ✅ 部分：日志、`/metrics`、健康检查已完成；Sentry 与告警未做 |
| 0.5 测试基座（Vitest + CI） | ✅ v1.2.0（v1.5.0 已 169 例） |
| 0.6 错误边界 + 动作队列 | ✅ v1.2.0 |
| 0.7 PWA + OG | ✅ v1.2.0（动态分享图未做） |
| 0.8 备份与恢复 | ✅ v1.3.0（脚本 + systemd timer + runbook，演练记录待补） |
| 0.9 法务三件套 | ✅ v1.3.0（用户协议、隐私政策、导出与注销入口） |
| 1.3 云端纪念册（时间线 / 导出） | 🟡 时间线与 JSON 导出已完成；长图 / PDF 导出未做 |


---

## 1. 现状评估

### 1.1 已有资产（要保留的优势）

| 资产 | 说明 | 商业价值 |
| --- | --- | --- |
| 服务端权威架构 | 规则/计时/计分全在 `server/games/*.mjs`，客户端只渲染快照 | 无规则分歧、可重连，天然适合弱网 |
| 双人房间模型 | 6 位房间码 + token 座位 + 断线重连 + 接管旧连接 | 核心体验闭环已成立 |
| 6 款完整游戏 | 聊天卡 / 画猜 / 心有灵犀 / 你懂我吗 / 五子棋 / 跳棋 | 首发内容够用，冷启动有说服力 |
| 协议级 e2e | `scripts/smoke.mjs` 覆盖全部 6 款游戏 + 断线重连 + 结算 + 统计 | 改规则时的安全网 |
| 按需加载 | `import.meta.glob` 拆分游戏 chunk | 首屏轻，扩游戏不拖慢 |
| 工程化雏形 | TS 严格模式、CI（Node 20/22）、Docker 多阶段、结构校验脚本 | 交付基础具备 |
| 设计一致性 | 单屏优先、`100dvh`、SVG 小动物、WebAudio 音效 | 有辨识度，省素材成本 |

### 1.2 成熟度打分（10 分制）

| 维度 | 现状 | 商业目标 | 差距 |
| --- | --- | --- | --- |
| 核心玩法 | 7.5 | 8.5 | 内容深度、难度曲线、新手引导 |
| 稳定性 | 5.0 | 9.0 | 持久化、多实例、故障恢复 |
| 安全 | 4.0 | 8.5 | 传输凭证、限流、CSP、审计 |
| 可观测性 | 1.5 | 8.0 | 日志/指标/追踪/告警/错误上报 |
| 质量保障 | 4.0 | 8.5 | 单测、浏览器 e2e、视觉回归、压测 |
| 前端体验 | 6.5 | 8.5 | PWA、错误边界、无障碍、暗色、i18n |
| 增长能力 | 3.0 | 8.0 | 账号、分享卡、SEO、埋点、邀请 |
| 商业化 | 0.5 | 8.0 | 权益、支付、订单、退款、发票 |
| 合规法务 | 1.0 | 8.0 | 协议、隐私、备案、未成年保护 |
| 运维交付 | 5.0 | 8.5 | 环境分层、备份、灰度、回滚、值班 |

> 综合：**约 3.9 / 10**，属于"能演示、能小范围玩，但不足以对外收费"的阶段。

### 1.3 上线阻断项（P0 缺陷）

| # | 问题 | 位置 | 影响 | 建议 |
| --- | --- | --- | --- | --- |
| 1 | 所有状态在内存，重启/扩容即丢房间与纪念册 | `server/rooms.mjs` 的 `rooms = new Map()` | 无法承诺"纪念册永久保存" | 接 SQLite/Postgres，热数据内存 + 落盘 |
| 2 | WS 凭证放在 URL query（`?token=`） | `server/index.mjs:141`、`src/lib/useRoom.ts:14` | 反代/网关访问日志会记录长期 token，泄露即可接管座位 | 改为连接后首帧 `auth` 消息 + 一次性短时 ticket |
| 3 | 无任何错误上报与告警 | 全局 | 线上白屏/掉线无人知晓 | Sentry + 指标 + 告警 |
| 4 | 无 HTTP 层限流，房间码可被枚举爆破 | `server/index.mjs` | 恶意建/猜房间消耗资源 | 按 IP 限流 + 加入失败退避 + 监控 |
| 5 | 无安全响应头/CSP | `server/index.mjs` | XSS、点击劫持、信息泄露风险 | helmet + CSP + HSTS |
| 6 | 无账号与数据归属，换设备即失联 | 全局 | 无法做订阅、跨端、找回 | 账号体系（邮箱 magic link 起步） |
| 7 | 无隐私政策/用户协议/注销能力 | 无 | 无法合规上架与投放 | 法务三件套 + 数据导出/删除 |
| 8 | 无 PWA manifest / 图标 / 离线页 | `public/` 仅 favicon | 移动端"添加到主屏"体验缺失 | manifest + SW + apple-touch-icon |
| 9 | 分享无 OG 卡片 | `index.html` | 微信/Twitter 分享是白板，增长受损 | OG/Twitter meta + 动态分享图 |
| 10 | 无自动化测试，规则改动靠 smoke 兜底 | 无测试目录 | 加游戏/改规则回归风险高 | Vitest 单测 + Playwright 双端 e2e |

### 1.4 技术债清单（非阻断但会拖慢）

- `src/styles.css` **4854 行 / 80KB** 单文件，无作用域隔离；继续加游戏会失控。
- 无 ESLint / Prettier / 提交钩子，风格靠自觉。
- `index.html` 无 `og:*`、`twitter:*`、`canonical`、结构化数据、`robots.txt`、`sitemap.xml`。
- `package.json` 关键词写了 `pwa`，但实际没有 manifest/SW，宣传与实现不一致。
- 无 React Error Boundary，任一渲染异常即整页白屏。
- 无离线兜底：WS 断开时动作直接丢弃（只弹提示），弱网体验差。
- 房间容量上限 5000、TTL 12h 均为硬编码常量，无配置化。
- 无管理后台/客服工具：处理"我的纪念册没了""有人骚扰"只能翻日志。
- 日志为 `console.log/error`，无结构化字段、无 requestId、无脱敏。

---

## 2. 商业目标与定位

### 2.1 定位

**一句话**：给异地恋 / 同居情侣的「每晚 10 分钟」在线双人小游戏小屋。

| 维度 | 选择 | 理由 |
| --- | --- | --- |
| 用户 | 18–35 岁情侣，异地优先 | 强刚需、高分享意愿、愿意为"关系"付费 |
| 场景 | 睡前/周末的固定双人时段 | 高频、低时长、可养成习惯 |
| 差异 | 无陌生人、无排行榜、无广告、记录成册 | 与派对游戏/陌生人社交彻底区隔 |
| 平台 | Web / PWA 优先，暂不做原生 App | 免安装、分享即玩、迭代快；避开应用商店抽成与审核 |
| 市场 | 先中文（大陆+港澳台+海外华人），再英文 | 内容与文化强相关，先打透单一语言 |

### 2.2 商业模式假设（需验证）

| 模式 | 内容 | 定价假设 | 优先级 |
| --- | --- | --- | --- |
| 免费 | 全部 6 款游戏、每日 3 条纪念册、基础卡组 | ¥0 | P0 |
| 订阅 Duo+ | 无限纪念册、全部卡组/主题、关系统计、跨设备同步、专属表情 | ¥12/月，¥68/年 | P2 |
| 一次性 | 精装纪念册 PDF/长图、周年回顾 | ¥18/次 | P2 |
| 礼物 | 送给 TA 的会员兑换码 | ¥68 起 | P3 |
| 内容包 | 节日卡组、主题皮肤 | ¥6–12 | P3 |
| 广告 | **不做** | — | — |

> 原则：**免费版必须完整可玩**，付费买的是"保存、纪念、装扮"，不是"解锁玩法"。这符合情侣产品的情绪价值，也避免口碑反噬。

### 2.3 指标体系

**北极星指标**：`每周完成 ≥3 局的双人房间数`（Weekly Active Couples）。

| 层级 | 指标 | 目标（上线 3 个月） |
| --- | --- | --- |
| 获取 | 分享链接打开率、邀请转化率 | ≥ 45% / ≥ 60% |
| 激活 | 建房 → 对方入座 | ≥ 60% |
| 留存 | D1 / D7 / D30 | ≥ 40% / ≥ 20% / ≥ 10% |
| 参与 | 单次时长、每周局数、游戏完成率 | ≥ 18min / ≥ 3 局 / ≥ 85% |
| 收入 | 付费转化率、ARPPU、月流失 | 2–5% / ¥20–50 / < 8% |
| 质量 | 崩溃自由会话、动作 p95 延迟 | ≥ 99.5% / < 100ms |
| 口碑 | NPS | ≥ 40 |

---

## 3. 目标架构

### 3.1 演进路径

```
阶段 A（现在）        阶段 B（P0 后）           阶段 C（P2 后）
浏览器 ── WS ── Node  浏览器 ── WS ── Node      浏览器 ── CDN ── LB
                  │                    │                        │
              内存 Map             SQLite（WAL）          Node × N ── Redis
                                    │                        │
                              本地磁盘备份                Postgres（主从）
                                                             │
                                                        对象存储（分享图/导出）
```

**关键决策：不要过早微服务化。** 单进程 + SQLite 足以支撑到约 1–3 千并发房间（需压测确认）；到达瓶颈再上 Redis + Postgres，架构改动集中在 `rooms.mjs` 的存储层与广播层。

### 3.2 技术选型决策表

| 议题 | 现在 | P0 建议 | P2 建议 | 理由 |
| --- | --- | --- | --- | --- |
| 持久化 | 无 | SQLite（`better-sqlite3`，WAL） | Postgres 16 | 单文件、零运维、事务够用；SQLite→PG 的 SQL 差异可控 |
| 房间存储 | 全内存 | 内存热数据 + 2s 防抖落盘 + 结束时强写 | Redis 热数据 + PG 归档 | 减少写放大，崩溃最多丢 2s |
| 多实例 | 不支持 | 不做 | Redis Pub/Sub + 房间亲和路由 | 房间有状态，必须按 code 粘性路由 |
| 鉴权 | 房间 token | 保持 + WS 首帧认证 | 邮箱 magic link + 会话 Cookie | 先解决泄露面，再做账号 |
| 实时协议 | JSON over WS | 保持 + zod 校验 + 版本号 | 可选 MessagePack | 2 人房间不是瓶颈，可读性优先 |
| 前端状态 | useState | 保持 | TanStack Query（仅账号/账单） | 游戏状态必须服务端权威，别引入客户端缓存 |
| 样式 | 单文件 CSS | 拆分 base / 组件 / 游戏 | CSS Modules 或 vanilla-extract | 控制 4854 行的继续膨胀 |
| 测试 | smoke | Vitest + Playwright | 契约测试 + 压测 + 混沌 | 规则正确性是产品生命线 |
| 可观测 | console | pino + prom-client + Sentry | OpenTelemetry + 托管看板 | 先能定位问题，再谈体系 |
| 部署 | 单容器 | Compose + Caddy/Nginx + 备份 | K8s 或托管容器 + CDN | 别为 1 个服务上 K8s |

### 3.3 建议目录演进

```
server/
  index.mjs              # 只做 HTTP/WS 装配
  config.mjs             # 环境变量集中校验（zod）
  rooms.mjs              # 领域逻辑
  store/
    index.mjs            # 存储接口：get/save/list/delete
    sqlite.mjs
    memory.mjs           # 测试用
  auth/
    session.mjs          # Cookie 会话
    ticket.mjs           # WS 一次性 ticket
  billing/
    plans.mjs
    webhooks.mjs
  observability/
    logger.mjs
    metrics.mjs
  moderation/
    words.mjs
src/
  components/
  games/
  features/
    account/
    billing/
    journal/
  lib/
  styles/
    base.css
    components.css
    games/<id>.css
tests/
  unit/games/*.test.mjs
  integration/api.test.mjs
  e2e/*.spec.ts
```

---

## 4. 分阶段路线图

### 阶段 0：可交付基线（P0，4–6 周）

**目标**：敢把链接发给陌生人，重启不丢数据，出问题 5 分钟内能定位。

| 工作项 | 交付物 | 验收标准 | 估时 |
| --- | --- | --- | --- |
| 0.1 持久化 | `store/` 抽象 + SQLite 实现 + 迁移脚本 | 重启后房间/纪念册/战绩完整恢复；断电最多丢 2s | 1.5 周 |
| 0.2 WS 鉴权改造 | 首帧 `auth` + 一次性 ticket | URL 不再出现长期 token；ticket 60s 过期、单次有效 | 3 天 |
| 0.3 安全加固 | helmet、CSP、HSTS、HTTP 限流、房间码退避 | 安全头扫描 A 级；爆破 20 次/分即被限 | 3 天 |
| 0.4 可观测性 | pino 结构化日志 + `/metrics` + Sentry + 告警 | 日志含 requestId/roomCode/seat 且脱敏；错误 1 分钟内告警 | 4 天 |
| 0.5 测试基座 | Vitest + 每个游戏 ≥10 条规则用例 + CI 门禁 | 服务端游戏模块行覆盖 ≥ 85% | 1 周 |
| 0.6 错误边界与降级 | React ErrorBoundary + 重连横幅 + 动作队列 | 单游戏崩溃不影响大厅；断网 30s 内动作可重放 | 2 天 |
| 0.7 PWA 与分享 | manifest、图标、SW、OG/Twitter、动态分享图、`robots.txt`/`sitemap` | Lighthouse PWA 通过；微信/Twitter 分享有图有标题 | 4 天 |
| 0.8 备份与恢复 | 每日备份 + 恢复演练脚本 + runbook | 从备份恢复 ≤ 30 分钟，演练记录留档 | 2 天 |
| 0.9 法务三件套 | 用户协议、隐私政策、注销/导出入口 | 注册前明示同意；7 日内可删除全部数据 | 3 天（含外部审阅等待） |

**阶段出口**：`npm run verify`（lint + typecheck + unit + e2e + build + smoke）全绿；备份恢复演练通过；Sentry 无未处理异常；可对外小范围公测。

---

### 阶段 1：留存与体验（P1，6–8 周）

**目标**：让"玩过一次"变成"每周都来"。

| 工作项 | 说明 | 验收标准 | 估时 |
| --- | --- | --- | --- |
| 1.1 账号体系 | 邮箱 magic link / 微信扫码（可选）；游客可升级 | 换设备可恢复纪念册；账号可注销 | 2 周 |
| 1.2 情侣绑定 | 邀请码绑定固定伴侣，复用房间 | 绑定后一键开局，无需每次输房间号 | 1 周 |
| 1.3 云端纪念册 | 时间线、筛选、详情、导出长图/PDF | 100 条记录加载 < 1s；导出图可分享 | 1.5 周 |
| 1.4 每日一问 / 每周回顾 | 推送一条问题；周日生成回顾 | 推送打开率 ≥ 15%；回顾查看率 ≥ 30% | 1 周 |
| 1.5 新手引导 | 首次进入 3 步引导 + 空状态 + 示例局 | 首局完成率提升 ≥ 15%（A/B） | 4 天 |
| 1.6 内容扩充 | 新增 2–4 款游戏 + 节日卡组 | 每款通过 check-games + smoke | 2–3 周 |
| 1.7 无障碍与暗色 | 键盘可玩、aria-live、对比度、prefers-color-scheme | axe 无严重问题；键盘可完成一局五子棋 | 1 周 |
| 1.8 i18n 基座 | 文案抽离 + 英文 | 中英切换无硬编码残留 | 1 周 |
| 1.9 移动端打磨 | 触感反馈、iOS 音频解锁、安全区、横屏提示 | 375×667 至 1440×900 无布局破损 | 4 天 |

**阶段出口**：D7 留存 ≥ 20%；分享带来的新用户占比 ≥ 30%；崩溃自由会话 ≥ 99%。

---

### 阶段 2：账号与商业化（P2，8–12 周）

**目标**：跑通"愿意付钱 → 能付钱 → 付得放心"。

| 工作项 | 说明 | 验收标准 | 估时 |
| --- | --- | --- | --- |
| 2.1 权益体系 | `free/plus` 能力开关，服务端判定 | 客户端无法伪造权益 | 1 周 |
| 2.2 支付接入 | Stripe（海外）+ 微信/支付宝（大陆） | 沙箱 + 小额真实支付全流程通过 | 2 周 |
| 2.3 订单与订阅 | 订单表、幂等 webhook、续费、退款、对账 | 重复 webhook 不重复发货；退款自动降权 | 1.5 周 |
| 2.4 发票与税务 | 电子发票/收据、Stripe Tax | 用户可自助开票 | 1 周 |
| 2.5 付费墙与定价实验 | 3 档定价、年付锚点、A/B | 付费转化 ≥ 2% | 1 周 |
| 2.6 管理后台 | 用户/房间/订单查询、封禁、补发、内容审核 | 客服 5 分钟内处理一单 | 2 周 |
| 2.7 埋点与漏斗 | 事件表 + 漏斗看板 + 留存 cohort | 关键漏斗可視化，误差 < 5% | 1 周 |
| 2.8 增长闭环 | 邀请奖励、分享卡片模板、SEO 落地页 | 自然分享占比 ≥ 40% | 2 周 |

**阶段出口**：首月付费转化 ≥ 2%，退款率 < 3%，支付相关 P0 事故为 0。

---

### 阶段 3：规模化与增长（P3，持续）

- 多实例：Redis 广播 + 房间亲和 + Postgres 主从。
- 对象存储 + CDN：分享图、导出文件、静态资源。
- 内容工业化：每月 1–2 款新游戏 / 每季主题卡组；建立内容日历。
- 增长实验：邀请裂变、节日活动、情侣周年、联名。
- 国际化：英文、繁体、日语；GDPR/CCPA 流程。
- 商业化扩展：礼物卡、企业/婚礼场景、线下二维码卡片。
- 可靠性：SLO 99.9%、混沌演练、灾备演练、值班轮转。

---

## 5. 专题细化

### 5.1 稳定性与可靠性

| 项 | 做法 | 验收 |
| --- | --- | --- |
| 崩溃恢复 | 进程启动时从存储 rehydrate 未过期房间；游戏 `run` 幂等 | 重启后客户端自动重连并恢复局面 |
| 写入策略 | 动作后标记 dirty，2s 防抖落盘；结算/离开时同步写 | 强杀进程最多丢 2s 内的动作 |
| 数据保留 | 房间 12h 无人回收；纪念册永久；软删除 30 天 | 用户可恢复误删 |
| 备份 | SQLite 每日全量 + WAL 增量；异地对象存储；保留 30 天 | 恢复演练 RTO ≤ 30min、RPO ≤ 5min |
| 灰度 | 新版本先 5% 房间（按 code 哈希），异常自动回滚 | 灰度期错误率不高于基线 1.5 倍 |
| 降级 | 关闭非核心（分享图生成、导出）保核心对局 | 依赖故障时对局可用 |

### 5.2 安全

- **凭证**：WS 改为连接后 `auth` 首帧；ticket 60s、单次、绑定 IP 段（可选）；服务端日志对 token/ticket 一律脱敏。
- **传输**：强制 HTTPS/WSS；HSTS 6 个月；TLS 1.2+。
- **头部**：CSP（`default-src 'self'`；`connect-src 'self' wss://<host>`；`img-src 'self' data: blob:`；避免 `unsafe-eval`）、`X-Content-Type-Options`、`Referrer-Policy: strict-origin-when-cross-origin`、`Permissions-Policy` 仅保留必要能力。
- **输入**：所有 REST/WS 入参用 zod 校验；昵称/下注文案做长度+敏感词+控制字符过滤；`action` 白名单。
- **限流**：IP 级（建房 10/min、加入 30/min、查询 120/min）+ 座位级 token bucket（已有 320/5s 可保留）+ 全局并发上限。
- **枚举防护**：加入失败按 IP 指数退避；房间码保持 31^6 ≈ 8.9 亿空间；监控异常失败率。
- **内容安全**：举报入口 + 房间快照留存 7 天（仅用于审核，隐私政策明示）；画猜可选"敏感词猜测"过滤。
- **依赖**：Dependabot + `npm audit`/OSV 扫描；锁文件提交；生产 `npm ci --omit=dev`。
- **密钥**：环境变量注入，禁止入库/入仓；部署平台 Secret 管理；季度轮换。
- **审计**：管理后台操作留痕（谁、何时、对哪个用户做了什么）。

### 5.3 数据模型草案

```sql
-- 账号
users(id TEXT PK, email TEXT UNIQUE, email_verified_at INT, created_at INT, deleted_at INT)
sessions(id TEXT PK, user_id TEXT, expires_at INT, created_at INT)
profiles(user_id TEXT PK, nickname TEXT, avatar TEXT, color TEXT, updated_at INT)

-- 情侣关系
couples(id TEXT PK, invite_code TEXT UNIQUE, created_at INT)
couple_members(couple_id TEXT, user_id TEXT, seat INT, joined_at INT, PRIMARY KEY(couple_id, user_id))

-- 房间与对局
rooms(code TEXT PK, couple_id TEXT, game_id TEXT, settings_json TEXT, state_json TEXT,
      version INT, created_at INT, updated_at INT, expires_at INT)
games(id TEXT PK, room_code TEXT, game_id TEXT, run_id TEXT, state_json TEXT,
      started_at INT, ended_at INT, winner_seat INT, summary_json TEXT)

-- 纪念册
journal_entries(id TEXT PK, couple_id TEXT, game_id TEXT, title TEXT, detail TEXT,
                data_json TEXT, played_at INT, deleted_at INT)
journal_favorites(user_id TEXT, entry_id TEXT, created_at INT, PRIMARY KEY(user_id, entry_id))

-- 商业化
plans(id TEXT PK, code TEXT, name TEXT, price_cents INT, currency TEXT, period TEXT, features_json TEXT)
subscriptions(id TEXT PK, user_id TEXT, plan_code TEXT, status TEXT, provider TEXT,
              provider_ref TEXT, current_period_end INT, cancel_at INT, created_at INT)
payments(id TEXT PK, user_id TEXT, amount_cents INT, currency TEXT, provider TEXT,
         provider_ref TEXT UNIQUE, status TEXT, created_at INT, raw_json TEXT)
entitlements(user_id TEXT, key TEXT, value_json TEXT, expires_at INT, PRIMARY KEY(user_id, key))

-- 运营
events(id INTEGER PK AUTOINCREMENT, user_id TEXT, anon_id TEXT, name TEXT, props_json TEXT, ts INT)
```

索引建议：`journal_entries(couple_id, played_at DESC)`、`rooms(expires_at)`、`subscriptions(user_id, status)`、`events(name, ts)`。

### 5.4 测试策略

| 层级 | 工具 | 覆盖 | 门禁 |
| --- | --- | --- | --- |
| 单元 | Vitest | 每个 `server/games/*.mjs` 的 create/action/tick/summary；越权、轮次、计分、判胜、序列化 | 行覆盖 ≥ 85% |
| 属性 | fast-check | 棋盘随机合法走子不崩、棋子数守恒、无重复落子 | 1000 次随机不失败 |
| 契约 | zod + 快照 | 客户端/服务端消息 schema、snapshot 字段稳定性 | 破坏性变更必须显式升级版本 |
| 集成 | supertest + ws | REST 建房/加入/错误码；WS 全消息类型；限流 | 全通过 |
| e2e | Playwright | 两个浏览器上下文跑完 6 款游戏、断线重连、分享、移动端视口 | 全通过 + 录屏留存 |
| 视觉 | Playwright screenshot + pixelmatch | 大厅、房间、6 款游戏首屏与结算页 | 差异 > 0.1% 失败 |
| 性能 | k6 | 500/2000 房间双人；动作 p95、广播 p95、内存 | p95 < 100ms，24h 无泄漏 |
| 混沌 | 脚本 | 杀进程、断网 30s、慢 3G、重复消息、超大 payload | 无数据损坏，能自愈 |

**CI 流水线**：`lint → typecheck → unit → build → integration → e2e（分片）→ smoke → 安全扫描 → 体积预算 → 部署 staging`。主干保护：必须全绿 + 1 人 review。

### 5.5 可观测性

**日志**（pino，JSON）：

```json
{"level":30,"time":1730000000000,"requestId":"...","room":"AB12CD","seat":0,
 "event":"action","game":"gomoku","action":"place","ms":3,"ok":true}
```

- 必带：`requestId`、`roomCode`、`seat`、`event`、`duration`、`result`。
- 禁止：token、ticket、邮箱明文、IP 全量（可哈希）。
- 采样：成功请求 10%，错误 100%。

**指标**（prom-client）：

| 指标 | 类型 | 用途 |
| --- | --- | --- |
| `duo_ws_connections` | Gauge | 在线连接 |
| `duo_rooms_active` | Gauge | 活跃房间 |
| `duo_actions_total{game,type,result}` | Counter | 玩法漏斗/失败率 |
| `duo_action_duration_ms` | Histogram | 动作处理延迟 |
| `duo_broadcast_duration_ms` | Histogram | 广播延迟 |
| `duo_event_loop_lag_ms` | Gauge | 单进程健康 |
| `duo_reconnect_total` | Counter | 弱网质量 |
| `duo_http_request_duration_ms{route,status}` | Histogram | API 性能 |
| `duo_errors_total{scope}` | Counter | 错误率 |

**告警**（首次响应目标 5 分钟）：

- 5xx 比例 > 2%（5 分钟）→ P1
- WS 连接数 5 分钟跌 > 50% → P1
- 进程存活失败 → P0
- 事件循环延迟 p95 > 200ms → P2
- 备份失败 / 磁盘 > 80% → P2

**SLO**：可用性 99.9%/月；API p95 < 150ms；动作到广播 p95 < 100ms；错误率 < 0.5%。

### 5.6 性能与前端体验

| 项 | 目标 | 做法 |
| --- | --- | --- |
| 首屏 JS | gzip < 180KB | 已按游戏分包；路由级懒加载；移除未用依赖 |
| CSS | gzip < 30KB | 拆分 base/components/games，按需加载游戏样式 |
| LCP | < 2.5s（4G 中端机） | 字体系统栈、SVG 内联、关键 CSS 内联 |
| CLS | < 0.1 | 预留画布/棋盘尺寸，避免图片撑开 |
| INP | < 200ms | 棋盘渲染 memo、笔迹批量绘制 |
| WS | 单消息 < 32KB | 笔迹分片（已有 45ms 批）、permessage-deflate |
| 缓存 | 静态资源 immutable 1 年 | Vite hash 文件名；`index.html` no-cache |
| 弱网 | 断网可感知、可恢复 | 重连横幅、动作队列、指数退避（已有基础） |

**体验清单**：ErrorBoundary、骨架屏、空状态、分享海报、二维码、复制回退、iOS 音频解锁、震动反馈、`prefers-reduced-motion`、暗色模式、横屏提示、字号缩放不破版。

### 5.7 产品功能路线（按价值/成本排序）

| 功能 | 价值 | 成本 | 阶段 |
| --- | --- | --- | --- |
| 云端纪念册 + 导出长图 | 高（情绪价值/付费点） | 中 | P1 |
| 情侣绑定 + 一键开局 | 高（留存） | 中 | P1 |
| 每日一问 / 每周回顾 | 高（习惯） | 低 | P1 |
| 新游戏（每月 1–2 款） | 高（内容） | 中 | 持续 |
| 主题/装扮/表情包 | 中（付费） | 低 | P2 |
| 文字聊天 / 语音 | 中（但审核成本高） | 高 | P3，谨慎 |
| 成就与里程碑 | 中 | 低 | P2 |
| 纪念日提醒 | 高 | 低 | P1 |
| 游客模式转正 | 高（转化） | 低 | P1 |
| 观战/三人以上 | 低（偏离定位） | 高 | 不做 |

**明确不做**：陌生人匹配、公开房间、排行榜、广告、社交动态流。这些会破坏"只有我们两个人"的核心体验。

### 5.8 商业化与支付

**权益设计**：

| 能力 | Free | Duo+ |
| --- | --- | --- |
| 全部游戏 | ✅ | ✅ |
| 纪念册 | 最近 3 条 | 无限 + 搜索 + 导出 |
| 卡组 | 基础 2 套 | 全部 + 每月新卡组 |
| 主题 | 默认 | 全部 + 节日限定 |
| 关系统计 | 基础 | 完整（局数/时长/胜率/周年） |
| 跨设备 | ❌ | ✅ |
| 价格 | ¥0 | ¥12/月 / ¥68/年 |

**支付落地要点**：

- 服务端是唯一权益来源；客户端只展示。
- Webhook 必须验签 + 幂等（`provider_ref` 唯一键）+ 重放保护。
- 订阅状态机：`trialing → active → past_due → canceled → expired`，宽限期 3 天。
- 退款策略：7 天内未使用核心权益可退；自动降权并记录。
- 对账：每日拉取 provider 账单与本地 `payments` 比对，差异告警。
- 税务：Stripe Tax 自动计算；大陆电子发票需接第三方（如诺诺/百望）。
- 合规文案：自动续费前 5 日提醒、随时可取消、价格含税说明。

### 5.9 增长与运营

| 渠道 | 动作 | 指标 |
| --- | --- | --- |
| 产品内分享 | 分享卡片（战绩/纪念册/邀请）、二维码、复制链接 | 分享率、点击率 |
| SEO | 每款游戏独立落地页、`sitemap.xml`、结构化数据、教程内容 | 自然搜索 UV |
| 内容 | 小红书/抖音"情侣必玩"、节日活动 | 新增用户 |
| 邀请 | 双方各得 7 天 Duo+ | 邀请转化率 |
| 留存 | 每日一问推送、周年提醒、每周回顾邮件 | D7/D30 |
| 口碑 | NPS 调研、用户故事、愿望墙 | NPS、UGC 数 |

**埋点规范**：事件名 `snake_case`，统一字段 `user_id/anon_id/couple_id/platform/version/ts`；关键漏斗：`home_view → room_create → partner_join → game_select → game_start → game_complete → journal_view → paywall_view → purchase`。隐私：默认匿名，同意后才关联账号；提供关闭开关。

### 5.10 合规与法务

> 以下为工程视角清单，不构成法律意见；上线前请找专业律师按实际运营地复核。

**通用三件套**：用户协议、隐私政策、Cookie/推送说明；注册前勾选同意；提供数据导出与账号注销；保留期限与删除机制。

**中国大陆（若公开运营/收费）**：

- ICP 备案（网站）+ 公安联网备案；域名实名。
- 若涉及在线游戏运营/收费：评估《网络游戏管理暂行办法》与版号/备案要求；小游戏类可能需备案。**建议先以"情侣互动工具"定位并咨询专业机构**，避免无版号收费。
- 未成年人保护：年龄提示、防沉迷（若被认定为网络游戏）、家长告知。
- 个人信息保护法：最小必要、单独同意（如推送/位置）、跨境传输评估、隐私政策中文可读。
- 电子商务法/消费者权益：经营者信息公示、7 天无理由（数字化内容例外需明示）、发票。
- 支付：微信/支付宝商户号需企业主体；不得二清。
- 内容安全：昵称/下注/画作举报与处置机制；留存日志不少于 6 个月（网络安全法）。

**海外**：

- GDPR：合法性基础、DPA、SCC（若数据回国）、DSAR（访问/删除/导出）、Cookie 同意、72 小时 breach 通知。
- CCPA/CPRA：Do Not Sell 链接（若适用）、隐私声明。
- 税务：VAT/GST 注册阈值、Stripe Tax。
- 无障碍：EU EAA（2025 起）、ADA；目标 WCAG 2.2 AA。
- 年龄：COPPA（13 岁以下）——产品定位 18+，需年龄门。

**知识产权**：代码 MIT 可商用，但品牌名/插画/文案/卡牌内容的版权与商标需确认归属；第三方字体/音效/图标建立许可证清单（当前音效为 WebAudio 合成，风险低）。

### 5.11 部署与运维

| 项 | 现状 | 目标 |
| --- | --- | --- |
| 环境 | 本地 + 生产 | dev / staging / prod 三套，配置分离 |
| 发布 | 手动 build + 容器 | CI 构建镜像 → 推送 GHCR → staging 自动 → 生产手动审批 |
| 回滚 | 重新部署旧镜像 | 一键回滚上一版本（保留 10 个） |
| 迁移 | 无 | 启动时迁移 + advisory lock + 迁移前自动备份 |
| 健康检查 | `/api/health` | 增加 `/healthz`（liveness）与 `/readyz`（DB/磁盘） |
| 反代 | 建议 Nginx | Caddy/Nginx 托管 TLS、HTTP/2、gzip/brotli、WS upgrade |
| 日志 | stdout | 采集到 Loki/CloudWatch，保留 30 天 |
| 备份 | 无 | 每日全量 + 增量，异地，季度恢复演练 |
| 成本 | 单机 | 起步 2C4G（约 $20–40/月）；CDN 按量；监控 $0–50 |

**Runbook 必备**：服务起不来、WS 大面积断连、数据库损坏、支付 webhook 堆积、被刷/被攻击、数据误删、证书过期。

---

## 6. 里程碑与资源

| 里程碑 | 周期 | 关键结果 | 人力 |
| --- | --- | --- | --- |
| M0 内测可交付 | 第 1–6 周 | 持久化、监控、安全、测试、PWA 完成；邀请 50 对情侣内测 | 1 全栈 + 0.3 QA |
| M1 公测 | 第 7–14 周 | 账号/绑定/纪念册；D7 ≥ 20%；500 对活跃 | 1 全栈 + 0.5 设计 |
| M2 商业化 | 第 15–26 周 | 订阅上线；转化 ≥ 2%；客服/后台就绪 | 1–2 全栈 + 0.5 运营 |
| M3 规模化 | 第 27 周起 | 多实例、国际化、月新增 1–2 款游戏 | 2 全栈 + 1 内容 |

**预算粗估（首年）**：服务器 $300–800；域名/证书 $50；监控/邮件 $200–600；设计 $1k–3k；法务 $500–2k；支付手续费 2.9%+；营销弹性。

---

## 7. 风险登记册

| 风险 | 概率 | 影响 | 缓解 |
| --- | --- | --- | --- |
| 内容消耗快，玩几周就腻 | 高 | 高 | 内容日历、每月新游戏、UGC 卡组、每日一问 |
| 双人产品冷启动难（对方不来） | 高 | 高 | 游客单人预览、异步模式、邀请奖励、分享卡 |
| 大陆合规（版号/备案）不确定 | 中 | 高 | 先海外/工具定位；律师评估；不急于收费 |
| 单点故障/数据丢失 | 中 | 高 | 持久化、备份、恢复演练、监控告警 |
| 支付欺诈/退款 | 中 | 中 | 风控规则、幂等、退款策略、黑名单 |
| 恶意骚扰/内容违规 | 中 | 中 | 举报、留存、封禁、敏感词 |
| 变现伤体验 | 中 | 中 | 免费完整可玩，只卖纪念/装扮 |
| 大厂抄袭 | 中 | 中 | 速度、社区、情侣数据迁移成本 |
| 单人维护倦怠 | 高 | 中 | 自动化、文档、按阶段交付 |

---

## 8. 商业交付验收清单（Definition of Done）

**功能**

- [ ] 6+ 款游戏全部通过自动化 e2e，无已知 P0/P1 缺陷
- [ ] 断线 60s 内自动恢复，局面不丢
- [ ] 账号可注册/登录/注销/导出数据
- [ ] 纪念册云端保存、可分页、可导出
- [ ] 分享链接在微信/Telegram/Twitter 有正确标题与图片

**质量**

- [ ] 单测覆盖 ≥ 85%（服务端游戏规则），整体 ≥ 70%
- [ ] 压测 2000 并发房间 p95 < 100ms，24h 内存无增长
- [ ] 崩溃自由会话 ≥ 99.5%
- [ ] 备份恢复演练通过（RTO ≤ 30min，RPO ≤ 5min）

**安全**

- [ ] 无 token 出现在 URL/日志
- [ ] 安全头 A 级；依赖无高危漏洞
- [ ] 限流与枚举防护生效
- [ ] 外部渗透测试或至少 OWASP ASVS L1 自查通过

**合规**

- [ ] 用户协议、隐私政策、Cookie 说明上线
- [ ] 数据删除/导出可用
- [ ] 备案/资质按运营地完成
- [ ] 支付条款、自动续费提醒、退款政策清晰

**运营**

- [ ] 埋点漏斗与留存看板可用
- [ ] 客服后台可查用户/房间/订单
- [ ] 状态页与故障公告渠道
- [ ] 值班与升级路径明确

**交付**

- [ ] 一键部署 + 一键回滚
- [ ] Runbook 覆盖 7 类故障
- [ ] 版本号、CHANGELOG、发布说明规范

---

## 9. 两周内可完成的 10 件事

按投入产出排序，全部可独立上线：

1. **安全头 + CSP + 限流**（2 天）：`helmet` + `express-rate-limit`，先挡最常见风险。
2. **OG/Twitter 卡片 + 动态分享图**（2 天）：分享转化立刻可测。
3. **PWA manifest + 图标 + 离线页**（1 天）：可安装、可回访。
4. **Sentry + ErrorBoundary**（1 天）：白屏从"不知道"变"立刻知道"。
5. **pino 结构化日志 + `/metrics`**（1 天）：定位问题的地基。
6. **WS 首帧认证替代 URL token**（2 天）：消除凭证泄露面。
7. **Vitest + 每个游戏 10 条规则测试**（3 天）：后续所有改动的安全网。
8. **ESLint + Prettier + CI 门禁**（1 天）：统一风格，减少 review 噪音。
9. **SQLite 落盘最小版**（3 天）：房间与纪念册不再随重启消失。
10. **隐私政策/用户协议初稿 + 注销入口**（1 天，法务审阅另计）：为公开运营做准备。

---

## 10. 附录

### 10.1 事件埋点表（首版）

| 事件 | 触发 | 关键属性 |
| --- | --- | --- |
| `home_view` | 首页曝光 | `referrer`, `utm_*` |
| `room_create` | 建房成功 | `game_id` |
| `room_join` | 加入成功 | `code`, `seat` |
| `invite_share` | 点击分享 | `channel` |
| `game_select` | 选择游戏 | `game_id` |
| `game_start` | 开局 | `game_id`, `settings` |
| `game_complete` | 结算 | `game_id`, `duration`, `result` |
| `journal_view` | 打开纪念册 | `entry_count` |
| `journal_export` | 导出 | `format` |
| `paywall_view` | 看到付费墙 | `source` |
| `purchase_start` | 发起支付 | `plan`, `provider` |
| `purchase_success` | 支付成功 | `plan`, `amount`, `currency` |
| `ws_reconnect` | 重连 | `attempt`, `duration` |
| `error_client` | 前端异常 | `message`, `stack_hash` |

### 10.2 环境变量建议

```bash
NODE_ENV=production
PORT=8790
PUBLIC_URL=https://duo.example.com
DATABASE_URL=file:/data/duo.db
SESSION_SECRET=<32+ bytes>
SENTRY_DSN=
LOG_LEVEL=info
RATE_LIMIT_ROOM_CREATE=10/min
BACKUP_DIR=/data/backups
BACKUP_RETAIN_DAYS=30
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
WECHAT_MCH_ID=
WECHAT_API_V3_KEY=
```

### 10.3 关键文件索引

| 需求 | 文件 |
| --- | --- |
| 房间与规则入口 | `server/rooms.mjs` |
| WS 协议与限流 | `server/index.mjs` |
| 游戏规则 | `server/games/*.mjs` |
| 游戏界面 | `src/games/*.tsx` |
| 实时连接 | `src/lib/useRoom.ts` |
| 设置 schema | `shared/games/<id>.json`、`server/meta.mjs` |
| 结构与端到端校验 | `scripts/check-games.mjs`、`scripts/smoke.mjs` |
| 部署 | `Dockerfile`、`docker-compose.yml`、`.github/workflows/ci.yml` |

### 10.4 参考优先级矩阵

| 优先级 | 含义 | 例子 |
| --- | --- | --- |
| P0 | 不做就不能对外 | 持久化、鉴权改造、监控、备份、协议 |
| P1 | 不做就留不住 | 账号、纪念册、每日一问、PWA、暗色 |
| P2 | 不做就赚不到 | 权益、支付、后台、埋点 |
| P3 | 不做也能活 | 语音、多人、国际化、礼物卡 |

---

> 维护建议：每完成一个里程碑，回写"现状评估"分数与"阻断项"状态；路线图每季度评审一次，砍掉不再服务北极星指标的事项。
