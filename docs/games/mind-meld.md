# 心有灵犀（`mind-meld`）

轮流写一个词，同时揭晓；两人写同一个词就算心有灵犀。内置 190+ 个「灵感词」，没思路时可以点一个词填进输入框。

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

`_mind-meld.prompts.mjs` 导出 190+ 个不重复的中文联想词（以 2–4 字为主，覆盖日常、情绪、吃喝、季节、物件和一点点浪漫）和 `pickPrompts(history, count, random?)`。服务端在开局（`create`）和每次进入下一轮（`next`）时各抽 6 个，写进 `d.prompts` 随快照下发；抽取时会排除 `history` 词链里出现过的词，历史词用光后回退到全库。

客户端把 `d.prompts` 渲染成输入框下方的可点击芯片（`.mind-prompts` / `.mind-prompt-chip`），提示语是「没灵感？点一个词」。**点击只填入输入框，不自动提交**；已经提交后整行隐藏。`random` 参数用于单测注入固定随机数。

## 坑点

- 双方都提交才进入 `reveal`；`revealAt` 之后才显示答案。
- `norm` 会去掉空白和标点；词链去重也用它。
- 结算页的 `.result-chain` 样式在本游戏 CSS 里。

## 测试

```bash
npm run test:game -- mind-meld
npm run smoke:game -- mind-meld
```
