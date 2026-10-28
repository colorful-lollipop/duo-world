# 爱心跳棋（`checkers`）

8×8 西洋跳棋：斜走一格、跳过对方棋子吃子、到底线升王；吃子后还能跳就必须接着跳。

## 文件

| 作用 | 路径 |
| --- | --- |
| 元数据 / 设置 | `shared/games/checkers.json` |
| 服务端规则 | `server/games/checkers.mjs` |
| 客户端 | `src/games/checkers.tsx` |
| 样式 | `src/games/checkers.css` |
| 单测 | `tests/unit/checkers.test.mjs` |
| 端到端 | `scripts/smoke/checkers.mjs` |

## 数据形状（`game.data`）

```js
{
  board: number[64],        // -1 空 / 0/1 普通子 / 2/3 王
  turn, moveCount, mustCapture, chain,
  legal: { [from]: [{ to, captures }] },
  pending, phase, winner, draw, wager, wins,
}
```

## 动作

`move {from,to}`、`draw`、`accept`、`decline`、`cancel`、`resign`。

## 约定

- 棋盘索引 `row * 8 + col`；红方在下方，蓝方在上方。
- 升王后可以四个方向走；吃子优先级由 `mandatory` 设置控制。
- 连续吃子必须走完，客户端只看 `legal`，不要自己算规则。

## 测试

```bash
npm run test:game -- checkers
npm run smoke:game -- checkers
```
