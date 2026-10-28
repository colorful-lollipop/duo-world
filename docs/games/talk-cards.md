# 深夜聊天卡（`talk-cards`）

抽一张卡，聊一个平时不会问的问题；新增了实时文字聊天框，抽到卡之后可以直接打字回应。

## 文件

| 作用 | 路径 |
| --- | --- |
| 元数据 / 设置 | `shared/games/talk-cards.json` |
| 服务端规则 | `server/games/talk-cards.mjs` |
| 卡组 | `server/games/_talk-cards.deck.mjs` |
| 客户端 | `src/games/talk-cards.tsx` |
| 样式 | `src/games/talk-cards.css` |
| 单测 | `tests/unit/talk-cards.test.mjs` |
| 端到端 | `scripts/smoke/talk-cards.mjs` |

## 数据形状（`game.data`）

```js
{
  deck, idx, turn,          // 当前卡组、第几张、轮到谁抽
  phase,                    // draw | shown | over
  card, flipAt,             // 当前卡 {id, deck, text} + 翻牌时间
  used, shownCount,
  favorites: [[], []],      // 两边各自收藏的卡
  messages: [{ id, seat, text, at }],  // 聊天记录（最多保留最近 60 条）
}
```

## 动作

| 动作 | 谁能发 | 说明 |
| --- | --- | --- |
| `draw` | 轮到的人 | 抽一张 |
| `reroll` | 轮到的人 | 换一张 |
| `next` | 任意 | 聊完换对方抽 |
| `fav` | 任意 | 收藏 / 取消收藏当前卡 |
| `say` | 任意 | `{ text }` 1–120 字，写入聊天记录 |
| `finish` | 任意 | 结束这一局并结算 |

## 坑点

- `card` 只在 `shown` 阶段存在；`messages` 跨卡保留。
- 聊天输入框不要放在抽卡按钮的 form 里，避免回车触发抽卡。
- 抽卡 / 换卡有 900ms 翻牌动画（`flipAt`）。

## 测试

```bash
npm run test:game -- talk-cards
npm run smoke:game -- talk-cards
```
