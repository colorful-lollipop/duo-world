# 心有灵犀（`mind-meld`）

轮流写一个词，同时揭晓；两人写同一个词就算心有灵犀。新增「灵感词」题库，没思路时可以点一个词填进输入框。

## 文件

| 作用 | 路径 |
| --- | --- |
| 元数据 / 设置 | `shared/games/mind-meld.json` |
| 服务端规则 | `server/games/mind-meld.mjs` |
| 灵感词库 | `server/games/_mind-meld.prompts.mjs` |
| 客户端 | `src/games/mind-meld.tsx` |
| 样式 | `src/games/mind-meld.css` |
| 单测 | `tests/unit/mind-meld.test.mjs` |
| 端到端 | `scripts/smoke/mind-meld.mjs` |

## 数据形状（`game.data`）

```js
{
  round, maxRounds,
  phase,                    // submit | reveal | over
  history: [{ a, b, matched }],
  submitted: [null, null],  // 已提交的词（对自己可见、对对方只显示“写好了”）
  answers, revealAt,
  agrees: [false, false],
  roundMatched, matched, lastGain,
  prompts: ["海", "猫", ...],  // 本轮灵感词（可选，界面上的快捷芯片）
}
```

## 动作

| 动作 | 谁能发 | 说明 |
| --- | --- | --- |
| `submit` | 任意 | `{ word }` 1–12 字，不能和词链里的词重复 |
| `agree` | 任意 | 揭晓后确认“意思相近也算” |
| `next` | 任意 | 进入下一轮 / 结束 |

## 灵感词

`_mind-meld.prompts.mjs` 导出 `prompts` 数组和 `pickPrompts(history, count)`；服务端在开局和每轮切换时抽 6 个不重复的历史词，放进 `d.prompts`。客户端渲染成可点击的芯片，点击只填输入框，不自动提交。

## 坑点

- 双方都提交才进入 `reveal`；`revealAt` 之后才显示答案。
- `norm` 会去掉空白和标点；词链去重也用它。
- 结算页的 `.result-chain` 样式在本游戏 CSS 里。

## 测试

```bash
npm run test:game -- mind-meld
npm run smoke:game -- mind-meld
```
