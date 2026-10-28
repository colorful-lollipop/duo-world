# 深夜聊天卡（`talk-cards`）

抽一张卡，聊一个平时不会问的问题；抽到卡之后还可以在旁边的聊天框里直接打字回应。

卡组：轻松 19 张 / 走心 21 张 / 未来 19 张 / 小挑战 17 张，合计 76 张（`_talk-cards.deck.mjs`，id 唯一）。

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
  msgSeq,                   // 消息序号，只增不减；id 就是它的字符串
  lastSay: [0, 0],          // 两个座位各自的最后发言时间（限流用）
}
```

## 动作

| 动作 | 谁能发 | 说明 |
| --- | --- | --- |
| `draw` | 轮到的人 | 抽一张 |
| `reroll` | 轮到的人 | 换一张 |
| `next` | 任意 | 聊完换对方抽 |
| `fav` | 任意 | 收藏 / 取消收藏当前卡 |
| `say` | 任意 | `{ text }`，只允许 `phase !== "over"`；`trim()` 后 1–120 字，超出按字符截断；每座 250ms 最多一条 |
| `finish` | 任意 | 结束这一局并结算 |

## 文字聊天

抽卡阶段和翻牌阶段都能聊，聊天记录跨抽卡 / 换卡 / 下一张 / 收藏保留（`next` 清空的是 `card`，不动 `messages`），只有 `finish` 之后不允许再发。

- 服务端 `say`：`trim()` → 空文本返回「想说点什么呢，不能发空消息」；超过 120 字按 code point 截断（emoji 不会被切坏）；同一座位距上次发言不足 250ms 返回「说慢一点嘛，刚才那句我还没看完」。成功写入 `{ id: String(++msgSeq), seat, text, at: now }`，`messages` 超过 60 条时从头部裁掉。
- 客户端 `talk-chat-*`：面板在卡片 / 操作区右侧（≤720px 改为下方堆叠），消息按座位左右分列（自己「你」靠右紫底，对方昵称靠左米黄底），列表内部滚动并自动滚到底部；输入框 `maxLength=120`，回车发送（输入法组字中的回车不触发），`act()` 返回 `true` 才清空输入。
- 空状态文案：「抽到卡之后，可以在这里打字聊聊」。
- `summary` 在有人发过消息时补一句「聊了 N 句」，原有字段结构不变。

## 坑点

- `card` 只在 `shown` 阶段存在；`messages` 跨卡保留。
- 聊天输入框不要放在抽卡按钮的 form 里，避免回车触发抽卡（当前用 `onKeyDown` 显式拦截 Enter）。
- 聊天面板高度固定（桌面 `min(56dvh, 560px)`，720 断点 `min(38dvh, 300px)`，400 断点 `min(34dvh, 250px)`），消息列表自己滚动，不要把页面撑出滚动条。
- 抽卡 / 换卡有 900ms 翻牌动画（`flipAt`）。
- 限流按座位独立计算，且用服务端传入的 `now`（单测里必须显式传递增的时间，否则第二条会被限流）。

## 测试

```bash
npm run test:game -- talk-cards
npm run smoke:game -- talk-cards
```
