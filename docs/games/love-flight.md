# 爱情飞行棋（`love-flight`）

> 这份文档只描述这一款游戏。改它的时候不需要读别的游戏。

两人各一架小飞机，从 0 号格出发，轮流掷 1–6 点往前走；踩到事件格要先把卡处理完，才轮到下一个人。先到最后一格的人赢，输家抽一张撒娇卡。

这一版的界面是一张**弯曲的天空航线地图**：格子是沿途的小岛 / 云朵站，飞机是 SVG 绘制的小飞机。服务端仍然是唯一权威，客户端只根据 `lastMove`（旧存档退回比较 `pos`）把飞机逐格补间到服务端位置。

## 文件

| 作用 | 路径 |
| --- | --- |
| 元数据 / 设置表单 | `shared/games/love-flight.json` |
| 服务端规则 | `server/games/love-flight.mjs` |
| 棋盘布局 / 卡组 | `server/games/_love-flight.cards.mjs` |
| 客户端界面 | `src/games/love-flight.tsx` |
| 界面样式 | `src/games/love-flight.css` |
| 单元测试 | `tests/unit/love-flight.test.mjs` |
| 端到端冒烟 | `scripts/smoke/love-flight.mjs` |

## 数据形状（`game.data`）

```js
{
  phase: "roll" | "event" | "over",
  turn: 0,                 // 当前该谁掷
  round: 1,                // 轮数：新的 turn 变成 0 时 +1
  length: 18 | 24 | 30,
  board: [{ index, kind, emoji, label }],
  pos: [0, 0],
  dice: null,              // 最近一次点数（1–6）
  event: null | { kind, title, text, delta? },
  winner: null | 0 | 1,
  closing: null | { forSeat: 0 | 1, text },
  history: [{ seat, roll, from, to, kind }], // 只记掷骰造成的位移
  moveSeq: 0,              // 可见位移序号（只给动画用）
  lastMove: null | {
    id,                    // 从 1 开始递增
    source: "roll" | "event",
    seat,                  // 发起这次移动的座位
    kind,                  // 落点 kind，或事件 kind
    from: [0, 0],          // 移动前两人的位置
    to: [0, 0],            // 移动后两人的位置
    at
  },
  rolls: [0, 0],
  events: 0,               // 处理过的事件卡数量
  startedAt, endedAt,
  wins: [0, 0]
}
```

`board` 的 `kind` 只有这几种：`start / plain / truth / task / forward / back / swap / again / finish`。格子文案来自 `_love-flight.cards.mjs` 的 `KIND_META`，服务端生成棋盘时一起下发，客户端不再维护一份。

`lastMove` 是**纯展示元数据**，不参与回合、胜负或事件判定：

- 掷骰和 `forward / back / swap` 的 `resolve` 都会写一条；`truth / task / again` 没有位移，不写。
- `swap` 的 `from / to` 同时包含两个人的位置，客户端据此做双机交叉飞行。
- `history` 仍然只记录掷骰，保持旧单测和纪念册统计兼容。客户端优先用 `lastMove`，没有这个字段的旧房间会退回比较前后两次 `pos`，仍然能补间。
- 交换后两个座位都在同一格、或事件后退到 0 导致位置没变时，客户端直接落位。

## 动作

| 动作 | 谁能发 | 说明 |
| --- | --- | --- |
| `roll` | 当前 `turn` | `phase === "roll"` 时才允许；点数 `1 + floor(random*6)` |
| `resolve` | 当前 `turn` | `phase === "event"` 时处理这张卡 |

`resolve` 的效果：

| 事件 | 效果 |
| --- | --- |
| `truth` / `task` | 换人 |
| `forward` | 前进 2 格（夹到终点），到终点直接赢，否则换人 |
| `back` | 后退 2 格（夹到 0），换人 |
| `swap` | 和对方交换 `pos`，换人 |
| `again` | 清空 `event`，`phase` 回 `roll`，**turn 不变** |

## 服务端导出

- 默认导出 `{ create, action, tick, summary }`。
- 命名导出 `makeBoard(length)`（只认 18/24/30，其它值回退 24）、`applyDice(d, seat, value, now?, room?)`、`pickCard`，单测可以直接调。
- `applyDice` 是纯推进（不含随机数），`action` 里的 `roll` 调用它；传 `room` 才能在到终点时累加 `room.stats.wins["love-flight"]`。

## 客户端地图与动画

- `buildRoute(length, viewH)` 用一条连续的 S 形样条生成航线：
  - 按视口比例选 3–6 条航道；每条航道有轻微波浪和不同的左右端点，格子按整条航线的弧长均匀分布，所以不会退化成 6 列矩形表。
  - 桌面和手机都用同一个 1000 宽的 `viewBox`，高度由 `ResizeObserver` 跟随容器比例（620–1600），地图完整可见，页面不出滚动条。
  - 结尾格是爱心终点 + 塔楼，起点有旗子；事件格坐在小岛上，普通格坐在云朵上；天空里还有云、太阳和爱心小岛。
- 两架飞机是 `PlaneSprite`：机身、上下机翼、尾翼、驾驶舱 / 舷窗、螺旋桨、机尾编号、尾迹都是 SVG 手绘；颜色取自座位 profile 的 `color`，同格时沿航线法线错开。
- 当前回合的飞机上下浮动、螺旋桨加速；移动中的飞机有抬升、俯仰 / 倾斜和尾迹。`prefers-reduced-motion` 下直接落位。
- `useFlightMotion` 是客户端动画队列：
  - 第一次挂载、重连、换局、屏幕旋转导致航线重排时直接 `snap` 到服务端 `pos`。
  - 普通掷骰 / 事件前进后退：按 `lastMove.from/to` 拆成逐格路径，每格约 225ms，带弧线和倾斜。
  - `swap`：两架飞机同时沿相反方向的二次贝塞尔曲线交叉换位，约 1s。
  - 服务端连续状态下发时用队列串起来；动画期间再次收到新状态不会跳格。
  - 事件卡要等飞机落地（`busy === false`）才显示，避免刚掷完就被卡片盖住。
- 结算页仍由 `GameStageHost` 统一渲染；`Stage` 不处理 `phase === "over"`。因此获胜的最后一格会直接进结算页，Stage 里的降落动画不会播放。

## 约定 / 坑点

- 棋盘布局写死在 `LAYOUTS`，三种长度都保证首格 `start`、末格 `finish`、中间没有起点/终点，且六种事件格都出现。
- 落到 `forward` / `back` / `swap` 后的新格子**不会**再触发一次事件（避免连锁和死循环），这是刻意的简化。
- `events` 统计所有被 `resolve` 掉的事件卡（包括 `again`），summary 里写「路上遇到 N 个心动事件」。
- 动画只改客户端显示，**不要**在客户端改 `pos` 或伪造历史；所有按钮动作仍然只发 `act({ type: "roll" | "resolve" })`。
- 地图里的 `aria-label` 覆盖每个格子和每架飞机；SVG 本身用 `role="group"`，不要把整张图设成单个 `role="img"` 把子节点吞掉。
- CSS 全部写在 `src/games/love-flight.css`，不要动 `src/styles.css` 的全局舞台样式。

## 测试

```bash
npm run test:game -- love-flight
npm run smoke:game -- love-flight
npm run build
```

截图验收（需要 Chrome / Playwright，输出到 gitignored 的 `_shots/`）：创建房间、两个 token 进入游戏后，分别用 375×667、420×900、1440×900 截 `.lf-board-wrap`，并断言：

```js
document.documentElement.scrollHeight === window.innerHeight
document.querySelector(".love-flight-stage").scrollHeight ===
  document.querySelector(".love-flight-stage").clientHeight
```
