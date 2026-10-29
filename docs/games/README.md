# 单游戏开发指南

每款游戏的所有文件都集中在同一个 id 名下，改一款游戏不需要读别的游戏：

| 游戏 | 文档 | 状态 |
| --- | --- | --- |
| [深夜聊天卡](talk-cards.md) | `talk-cards` | 可玩 |
| [你画我猜](draw-guess.md) | `draw-guess` | 可玩 |
| [心有灵犀](mind-meld.md) | `mind-meld` | 可玩 |
| [你懂我吗](know-me.md) | `know-me` | 可玩 |
| [爱心五子棋](gomoku.md) | `gomoku` | 可玩 |
| [爱心跳棋](checkers.md) | `checkers` | 可玩 |
| [哥俩好](brothers.md) | `brothers` | 可玩 |
| [一起拆弹](bomb-squad.md) | `bomb-squad` | 可玩 |
| [爱情飞行棋](love-flight.md) | `love-flight` | 可玩 |

## 通用规则（每款游戏都一样）

- 服务端权威：`server/games/<id>.mjs` 默认导出 `{ create, action, tick?, summary?, view? }`。
  - `create(room)` → `game.data`（可 JSON 序列化，必含 `phase`）。
  - `action(room, seat, action, now)` → `null` 成功 / 字符串错误。
  - `tick(room, now)` → `boolean`，返回 true 会触发广播（可选）。
  - `summary(room)` → `{ title, detail, data? }`，`phase === "over"` 时自动写纪念册。
  - `view(data, seat)` → 按座位返回隐藏信息的浅拷贝（可选）。
- 客户端：`src/games/<id>.tsx` 导出 `Stage`（必填）+ `ResultExtra`（可选）；不要处理 `phase === "over"`。
- 样式：`src/games/<id>.css`，tsx 里 `import "./<id>.css"`。
- 题库：`server/games/_<id>.*.mjs`（下划线开头，自动发现器跳过）。
- 测试：`npm run test:game -- <id>`（单测）、`npm run smoke:game -- <id>`（端到端）。
