# 爱情飞行棋（`love-flight`）

> 这份文档只描述这一款游戏。改它的时候不需要读别的游戏。

两人各一颗棋子，从 0 号格出发，轮流掷 1–6 点往前走；踩到事件格要先把卡处理完，才轮到下一个人。先到最后一格的人赢，输家抽一张撒娇卡。

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
  history: [{ seat, roll, from, to, kind }],
  rolls: [0, 0],
  events: 0,               // 处理过的事件卡数量
  startedAt, endedAt,
  wins: [0, 0]
}
```

`board` 的 `kind` 只有这几种：`start / plain / truth / task / forward / back / swap / again / finish`。格子文案来自 `_love-flight.cards.mjs` 的 `KIND_META`，服务端生成棋盘时一起下发，客户端不再维护一份。

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

## 约定 / 坑点

- 棋盘布局写死在 `LAYOUTS`，三种长度都保证首格 `start`、末格 `finish`、中间没有起点/终点，且六种事件格都出现。
- 落到 `forward` / `back` / `swap` 后的新格子**不会**再触发一次事件（避免连锁和死循环），这是刻意的简化。
- `events` 统计所有被 `resolve` 掉的事件卡（包括 `again`），summary 里写「路上遇到 N 个心动事件」。
- 客户端棋盘 6 列蛇形：`row = floor(index/6)`，奇数行从右往左，用 `gridColumn/gridRow` 定位。
- 舞台固定高度、`overflow: hidden`，棋盘用 `flex: 1` + 绝对定位铺满剩余高度；事件卡是舞台内的覆盖层，顺带挡住误触。
- 客户端不处理 `phase === "over"`，结算页由 `GameStageHost` 统一渲染；`ResultExtra` 只展示统计和撒娇卡。

## 测试

```bash
npm run test:game -- love-flight
npm run smoke:game -- love-flight
```
