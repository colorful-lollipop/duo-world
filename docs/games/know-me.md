# 你懂我吗（`know-me`）

轮流当主角：主角如实回答关于自己的问题，另一半同时猜；揭晓后由主角给分，最后算默契指数。

## 文件

| 作用 | 路径 |
| --- | --- |
| 元数据 / 设置 | `shared/games/know-me.json` |
| 服务端规则 | `server/games/know-me.mjs` |
| 题库 | `server/games/_know-me.questions.mjs` |
| 客户端 | `src/games/know-me.tsx` |
| 样式 | `src/games/know-me.css` |
| 单测 | `tests/unit/know-me.test.mjs` |
| 端到端 | `scripts/smoke/know-me.mjs` |

## 数据形状（`game.data`）

```js
{
  idx, total, questions: [...],
  hero,                     // 本轮主角座位
  phase,                    // answer | reveal | revealed | over
  question,                 // { id, category, type, text, options?, left?, right? }
  submitted: [false, false],
  answers: [null, null],
  revealAt, autoDeadline,
  score, lastScore, history,
}
```

题目 `type`：`choice`（`options` 数组）、`scale`（0–100）、`text`（≤120 字）。

## 动作

| 动作 | 谁能发 | 说明 |
| --- | --- | --- |
| `submit` | 任意 | `{ answer }`：choice 用下标、scale 用数字、text 用字符串 |
| `grade` | 主角 | `{ score }` 0/5/10；揭晓动画后才能给 |
| `next` | 任意 | 下一题 / 结束 |

## 题库

`_know-me.questions.mjs` 导出 `questions` 数组；字段：`{ id, category, type, text, options?, left?, right? }`。

- 目前共 **126 道**，六个分类（吃喝 / 习惯 / 回忆 / 恋爱 / 假如 / 未来）各 21 道。
- 每个分类里 `choice` / `scale` / `text` 各 7 道，整体比例均衡。
- `id` 全局唯一；`choice` 至少 2 个 `options`，`scale` 必须同时有 `left` / `right`，`text` 题目不超过 120 字。
- 分类要同时出现在 `shared/games/know-me.json` 的 `categories` 选项里，否则筛不到。

## 坑点

- 45 秒不给分会自动按 5 分结束（`tick`）。
- 主角和猜的人提交顺序不限，但两边都提交才揭晓。
- 结算页的默契指数按 `score / (total * 10)` 算。

## 测试

```bash
npm run test:game -- know-me
npm run smoke:game -- know-me
```
