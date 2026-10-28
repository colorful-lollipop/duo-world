# 爱心五子棋（`gomoku`）

15×15 五子棋，先连成五子的人赢；悔棋 / 求和需要对方同意，输的人请奶茶。

## 文件

| 作用 | 路径 |
| --- | --- |
| 元数据 / 设置 | `shared/games/gomoku.json` |
| 服务端规则 | `server/games/gomoku.mjs` |
| 客户端 | `src/games/gomoku.tsx` |
| 样式 | `src/games/gomoku.css` |
| 单测 | `tests/unit/gomoku.test.mjs` |
| 端到端 | `scripts/smoke/gomoku.mjs` |

## 数据形状（`game.data`）

```js
{
  board: number[225],       // -1 空 / 0 红 / 1 蓝
  turn, move, last,
  moves, line, winner, draw,
  pending: { kind, by } | null,
  phase,                    // playing | over
  reason, wager, wins,
}
```

## 动作

`place {x,y}`、`undo`、`draw`、`accept`、`decline`、`cancel`、`resign`。

## 约定

- 棋盘索引 `y * 15 + x`；客户端渲染 `.gomoku-cell`。
- 悔棋只能撤回自己刚下的一步，且要对方同意。
- 胜场统计走 `_kit.mjs` 的 `gameWins`（`room.stats.wins.gomoku`）。

## 测试

```bash
npm run test:game -- gomoku
npm run smoke:game -- gomoku
```
