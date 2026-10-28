# 你画我猜（`draw-guess`）

两人轮流当画手：画手从 3 个词里挑一个画，另一个人只能看画猜词。**猜的人看不到那 3 个候选词，也看不到答案**。

## 文件

| 作用 | 路径 |
| --- | --- |
| 元数据 / 设置 | `shared/games/draw-guess.json` |
| 服务端规则 | `server/games/draw-guess.mjs` |
| 词库 | `server/games/_draw-guess.words.mjs` |
| 客户端 | `src/games/draw-guess.tsx` |
| 样式 | `src/games/draw-guess.css` |
| 单测 | `tests/unit/draw-guess.test.mjs` |
| 端到端 | `scripts/smoke/draw-guess.mjs` |

## 数据形状（`game.data`）

```js
{
  rounds, seconds, libraries,
  round, drawer,            // 第几轮、谁是画手（0/1）
  phase,                    // choose | drawing | reveal | over
  choices: [{ w, lib, lvl }],  // 只应让画手看到
  answer, category,         // 只应让画手看到
  deadline, revealAt,
  score, correctRounds,
  guesses: [{ seat, text, correct, near, at }],
  strokes,                  // 走 ink 通道，快照里会被剔除
  used, roundPoints, correct, correctSeat,
}
```

## 动作

| 动作 | 谁能发 | 说明 |
| --- | --- | --- |
| `choose` | 画手 | `{ index }` 选一个词 |
| `guess` | 猜的人 | `{ text }` 猜答案（画手不能猜） |
| `undo` / `clear` | 画手 | 撤销 / 清空画布 |
| `next` | 任意 | 揭晓后进入下一轮 |

## 按座位隐藏（重要）

服务端导出 `view(data, seat)`：非画手在 `choose / drawing` 阶段拿不到 `choices[].w` 和 `answer`，只拿到字数和分类提示；揭晓后才拿到答案。客户端也不能把候选词渲染给猜的人（用占位卡）。

## 坑点

- 画布坐标固定 1000×1000，走独立 `ink` 通道；普通快照会剔除 `strokes`。
- 猜词归一化在服务端做（全半角、标点、简单编辑距离）。
- 词库字段：`{ w, lib, lvl }`，`lvl` 1/2/3；同一词不要重复。

## 测试

```bash
npm run test:game -- draw-guess
npm run smoke:game -- draw-guess
```
