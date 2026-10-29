# 一起拆弹（`bomb-squad`）

信息不对称合作：**拆弹员**看着炸弹面板（序列号、电池、三个模块的颜色 / 符号 / 开关），**专家**手里只有拆弹手册。两人不能互看屏幕，拆弹员把看到的东西念出来，专家按手册指挥，拆完三个模块就赢；失误用光或倒计时归零就输。

## 文件

| 作用 | 路径 |
| --- | --- |
| 元数据 / 设置 | `shared/games/bomb-squad.json` |
| 服务端规则 | `server/games/bomb-squad.mjs` |
| 题库 / 手册 / 判定 | `server/games/_bomb-squad.bomb.mjs` |
| 客户端 | `src/games/bomb-squad.tsx` |
| 样式 | `src/games/bomb-squad.css` |
| 单测 | `tests/unit/bomb-squad.test.mjs` |
| 端到端 | `scripts/smoke/bomb-squad.mjs` |

## 设置

| key | 默认 | 说明 |
| --- | --- | --- |
| `difficulty` | `normal` | `easy` 300s / 4 次机会；`normal` 210s / 3 次；`hard` 150s / 2 次 |
| `defuser` | `0` | 谁当拆弹员（`0` 创建者 / `1` 加入者） |

## 数据形状（`game.data`）

```js
{
  phase: "playing" | "over",
  result: null | "defused" | "boom" | "timeout",
  difficulty, defuser,
  serial: "K7-42",        // 字母 + 数字 - 数字 + 数字，最后一位一定是数字
  batteries: 2,           // 1..3
  modules: [              // 固定三个（m1 剪线 / m2 符号 / m3 开关），数组顺序随机
    { id: "m1", type: "wires", title: "剪线", done: false, wires: ["红", "蓝", "白"] },
    { id: "m2", type: "symbols", title: "符号顺序", done: false,
      symbols: [{ key: "sun", label: "太阳", emoji: "☀️" }], progress: [] },
    { id: "m3", type: "switches", title: "拨开关", done: false,
      switches: [{ label: "红", up: false }] },
  ],
  answers: { m1: 1, m2: ["sun", "star", "moon", "skull"], m3: { 红: true, 蓝: false, 黄: true } },
  strikes: 0, maxStrikes: 3, solved: 0, total: 3,
  startedAt, deadline, timeLimit, endedAt,
  lastEvent: null | { kind: "strike" | "solved" | "defused" | "boom", moduleId?, at },
}
```

`answers` 只留在服务端：`view()` 对两个座位都把它抹掉。拆弹员的视图保留 `serial/batteries/完整 modules`，专家的视图把 `serial/batteries` 置 null、模块只留 `{ id, type, title, done }`，并补上 `manual`。

## 动作（只有拆弹员能发）

| 动作 | 参数 | 说明 |
| --- | --- | --- |
| `cut` | `{ module, index }` | 剪线，下标 0-based；错 → 记失误 |
| `press` | `{ module, symbol }` | 按符号；按对推进，按错清空 `progress` 并记失误 |
| `toggle` | `{ module, index }` | 翻转开关，不判定 |
| `submit` | `{ module }` | 三个开关全对 → 完成；否则记失误（保留当前状态） |

已完成的模块、`phase !== "playing"`、专家发来的动作都会被拒绝并返回中文提示。失误达到 `maxStrikes` → `end("boom")`；三个模块全完成 → `end("defused")`；`tick` 到 `deadline` → `end("timeout")`。这是纯合作游戏，不写 `gameWins`。

## 手册规则（`_bomb-squad.bomb.mjs`）

- **剪线**（线从左到右 1..n）：
  - 3 根：没红线 → 第 2 根；否则第 3 根是白线 → 第 3 根；否则 → 第 1 根。
  - 4 根：序列号最后一位奇数且第 1 根红线 → 第 1 根；否则最后一根黄线且没红线 → 第 1 根；否则恰好一根蓝线 → 第 2 根；否则 → 第 4 根。
  - 5 根：序列号最后一位偶数且第 2 根蓝线 → 第 4 根；否则恰好一根红线且最后一根不是红线 → 第 1 根；否则第 3 根白线 → 第 3 根；否则 → 最后一根。
- **符号顺序**：优先级 ☀️太阳 → ⭐星星 → 🌙月亮 → 💧雨滴 → 🔥火焰 → 🍃叶子 → 💗爱心 → 💀骷髅；序列号最后一位是偶数时整个顺序倒过来。
- **拨开关**：红 = 序列号最后一位奇数朝上；蓝 = 电池数奇数朝上；黄 = 剪线模块电线偶数根朝上。

`MANUAL` 是结构化对象（`intro` + `sections[{ type, title, icon, note, groups[{ when, items }] }]`），专家视图直接下发；改判定时**必须同步改 `MANUAL` 文案**，两边不一致玩家会被规则坑死。

`summary()` 写入纪念册的 `data` 是 `{ result, solved, total, strikes, seconds, difficulty }`，其中 `seconds` 是实际用时（`endedAt - startedAt`，秒），`detail` 会按结果写成「还剩 N 秒 / 拆到第 N 个 / 还有 N 个模块」。

## 纯函数

- `makeBomb(seed, difficulty?)`：mulberry32 确定性生成 `{ serial, batteries, modules, answers, difficulty }`，同 seed 完全一致；服务端 `create` 用 `Math.random()` 造种子。
- `answerOf(module, ctx)`：`ctx = { serial, batteries, modules }`；剪线返回 0-based 下标，符号返回完整 key 顺序，开关返回 `{ 红, 蓝, 黄 }`（`true` = 朝上）。
- 导出 `MANUAL`、`PRIORITY`、`DIFFICULTY`、`WIRE_COLORS`，单测和冒烟直接调用，不要另写一套判定。

## 客户端要点

- 顶部是角色横幅 + 倒计时（最后 60 秒变红）+ 失误圆点 + 已拆进度。
- 拆弹员：序列号牌、电池图标、三张模块卡（线按钮标 1..n，白色线有描边；符号按钮带进度槽；开关是上下滑块 + 确认）。
- 专家：可滚动的内置手册（条件用彩色 chip 突出）+「只动嘴，不动手」提示 + 模块完成状态；**绝不显示序列号 / 电池 / 线色**，并明确提醒「问 TA」。
- 声音只在 `strikes` / `solved` / `lastEvent.at` 变化时播（`useEffect` + `useRef` 比较），不要每次广播都响。
- 布局：`.bomb-stage` 是 `height:100%` 的 flex 列，`.bomb-board` / `.bomb-manual` 各自 `min-height:0` + 内部滚动并隐藏滚动条，页面不出现滚动条。断点 980/720/400；窄屏手册字号不低于 12.5px。
- 结算由 `GameStageHost` 统一渲染，`Stage` 不处理 `phase === "over"`；`ResultExtra` 只展示结果、拆掉模块数、失误、用时。

## 测试

```bash
npm run test:game -- bomb-squad
SMOKE_PORT=18811 npm run smoke:game -- bomb-squad
```

单测覆盖：`makeBomb` 稳定性 / 序列号 / 电池 / 线数 / 符号去重、剪线三种线数的规则边界、符号奇偶顺序、开关三条规则、`view` 按座位裁切、动作（拒绝专家、剪对剪错、符号清空进度、开关提交、boom、defused、结束后拒绝、tick 超时）、summary 字段。

冒烟：`enterGame` 设 `{ difficulty: "normal", defuser: 0 }` → 断言两边视图差异和专家动作被拒 → A 故意剪错一次（`strikes === 1`）→ 用 `answerOf` 依次完成剪线 / 符号 / 开关 → `result === "defused"` 且纪念册记录 `solved === 3`。
