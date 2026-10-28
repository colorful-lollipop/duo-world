# 贡献指南

欢迎给「二人世界」提 Issue、改代码或加新游戏。这是一个给两个人做的小游戏集合，
请保持它简单、可爱、易扩展。

## 快速开始

```bash
npm install
npm run dev        # 开发模式：前端 5173，后端 8790
npm run build      # 类型检查 + 游戏结构校验 + 生产构建
npm run smoke      # 端到端冒烟测试（两个客户端跑完所有游戏）
```

## 加一个新游戏（最常用的贡献方式）

```bash
npm run new:game -- <id> <名称> [emoji] [渐变1] [渐变2]
```

脚手架会生成这一款游戏需要的全部文件：

1. `shared/games/<id>.json` —— 名称、介绍、规则、设置表单
2. `server/games/<id>.mjs` —— 服务端规则（默认导出 `create/action/tick/summary`）
3. `src/games/<id>.tsx` + `src/games/<id>.css` —— 界面与独立样式
4. `tests/unit/<id>.test.mjs` —— 单元测试
5. `scripts/smoke/<id>.mjs` —— 端到端冒烟
6. `docs/games/<id>.md` —— 只讲这一款游戏的开发说明

然后：

- 只读 `docs/games/<id>.md`，把规则和界面写出来；
- `npm run test:game -- <id>` 和 `npm run smoke:game -- <id>` 单独验证这一款；
- 合入前 `npm run check:games && npm run smoke` 保证不破坏现有游戏。

详细的通用约定见 `server/games/_template.mjs` 和 `src/games/_template.tsx`。

## 代码风格

- 服务端用 `.mjs`（ESM），客户端用 TypeScript + React；
- 中文文案直接写在源码里，面向中国大陆用户；
- 服务端权威：规则全部在服务端，客户端只发动作、只展示；
- 提交信息用简洁的英文，例如 `feat: add red-rope game`；
- 改动尽量不引入新依赖。

## 提 PR

1. Fork 仓库，切一个分支：`git checkout -b feat/your-game`；
2. 改动后跑 `npm run build` 和 `npm run smoke`；
3. 提交并推送，创建 Pull Request，描述清楚「加的是什么、怎么玩」。

谢谢你的贡献 ❤️
