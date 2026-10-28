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

脚手架会生成三个文件并登记到 `shared/games.json`：

1. `server/games/<id>.mjs` —— 服务端规则（默认导出 `create/action/tick/summary`）
2. `src/games/<id>.tsx` —— 游戏界面（导出 `Stage`，可选 `ResultExtra`）
3. `shared/games.json` —— 名称、介绍、规则、设置表单

然后：

- 把规则和界面写出来；
- `npm run check:games` 校验三件套；
- `npm run smoke` 保证不破坏现有游戏。

详细的约定见 `server/games/_template.mjs` 和 `src/games/_template.tsx`。

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
