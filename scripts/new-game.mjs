// 脚手架：一条命令生成一个新游戏（服务端规则 + 界面 + 元数据 + 端到端冒烟 + 独立样式 + 文档）。
// 用法：node scripts/new-game.mjs <id> <名称> [emoji] [渐变1] [渐变2]
// 例：  node scripts/new-game.mjs red-rope 红绳 🔗 "#FF8A8A" "#E23E57"
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GAMES } from "../server/meta.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const metaDir = path.join(root, "shared", "games");
const serverDir = path.join(root, "server", "games");
const clientDir = path.join(root, "src", "games");
const smokeDir = path.join(root, "scripts", "smoke");
const docsDir = path.join(root, "docs", "games");

const [, , id, name, emoji = "🎲", g1 = "#FFCB6B", g2 = "#FF9A3C"] = process.argv;

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) fail("id 必须是 kebab-case，例如 checkers / red-rope");
if (!name) fail("需要传游戏名称，例如：node scripts/new-game.mjs red-rope 红绳");

const metaFile = path.join(metaDir, `${id}.json`);
const serverFile = path.join(serverDir, `${id}.mjs`);
const clientFile = path.join(clientDir, `${id}.tsx`);
const styleFile = path.join(clientDir, `${id}.css`);
const smokeFile = path.join(smokeDir, `${id}.mjs`);
const docFile = path.join(docsDir, `${id}.md`);
const testFile = path.join(root, "tests", "unit", `${id}.test.mjs`);
for (const file of [metaFile, serverFile, clientFile, styleFile, smokeFile, docFile, testFile]) {
  if (fs.existsSync(file)) fail(`文件已存在：${path.relative(root, file)}`);
}
if (GAMES.some((g) => g.id === id)) fail(`shared/games/${id}.json 已存在`);

const order = GAMES.reduce((max, g) => Math.max(max, Number(g.order) || 0), 0) + 10;

const server = `// ${name}：服务端规则（文件名 = 游戏 id）
// 会自动被 server/games/index.mjs 发现，不需要改任何中央文件。
// 这个游戏专属的题库/数值放在旁边的 _${id}.data.mjs（下划线开头不会被当成游戏）。
import { gameWins, otherSeat } from "./_kit.mjs";

export default {
  create(room) {
    const s = room.settings["${id}"] || {};
    const wins = gameWins(room, "${id}");
    return {
      phase: "playing",
      round: 0,
      rounds: Number(s.rounds) || 5,
      score: 0,
      wins: [...wins],
    };
  },

  action(room, seat, action, now) {
    const d = room.game.data;
    if (action?.type === "tap") {
      if (d.phase !== "playing") return "这一局已经结束啦";
      d.round++;
      d.score++;
      if (d.round >= d.rounds) d.phase = "over";
      return null;
    }
    return "这个操作暂时不可以";
  },

  tick(room, now) {
    return false;
  },

  summary(room) {
    const d = room.game.data;
    return {
      title: "${name}",
      detail: \`一起拿到了 \${d.score} 分\`,
      data: { score: d.score },
    };
  },
};
`;

const client = `// ${name}：游戏界面（文件名 = 游戏 id）
// 会按需加载：只有开局才下载这个 chunk。
// 样式只写在自己的 ${id}.css 里，不要动 src/styles.css，避免和别的游戏互相影响。
import { useState } from "react";
import type { StageProps } from "./types";
import "./${id}.css";

function GameStage(props: StageProps) {
  const { game, act, meta } = props;
  const d = game.data;
  const [local, setLocal] = useState(0);

  return (
    <section className="stage ${id}-stage">
      <div className="stage-topline">
        <span className="game-eyebrow">{meta.name}</span>
        <span className="round-chip">
          第 {Math.min(d.round + 1, d.rounds)} / {d.rounds} 轮
        </span>
      </div>
      <h2>{meta.tagline}</h2>
      <p className="muted">分数：{d.score}</p>
      <button
        className="primary"
        onClick={() => {
          setLocal(local + 1);
          act({ type: "tap" });
        }}
      >
        点一下
      </button>
      <p className="stage-hint">在这里写规则说明。</p>
    </section>
  );
}

export const Stage = GameStage;

export function ResultExtra({ game }: any) {
  const d = game.data;
  return <p className="result-note">这一局你们拿到了 {d.score} 分。</p>;
}
`;

const style = `/* ${name}：只属于这个游戏的样式。
   由 ${id}.tsx 直接 import，Vite 会把它打进这个游戏的按需 chunk。
   共用样式（按钮、弹窗、.stage 等）继续放在 src/styles.css。 */
.${id}-stage {
  max-width: 720px;
}
`;

const smoke = `// ${name}：端到端冒烟（npm run smoke:game -- ${id} 可单独跑）。
// 每个游戏一个文件，只改自己的，不要动 scripts/smoke.mjs。
export default async function run({ A, B, waitUntil, assert, sleep }) {
  A.send({ type: "exit" });
  await waitUntil(() => !A.state.game, "exit previous game");
  A.send({ type: "select", gameId: "${id}" });
  await waitUntil(() => A.state.gameId === "${id}", "select ${id}");
  A.send({ type: "start" });
  await waitUntil(() => A.game()?.phase === "playing", "${id} start");
  A.act({ type: "tap" });
  await waitUntil(() => A.game().score === 1, "${id} tap");
  assert(typeof A.game().phase === "string", "${id} state");
  console.log("done: ${id}");
}
`;

const unitTest = `import { describe, it, expect } from "vitest";
import game from "../../server/games/${id}.mjs";
import { allDefaultSettings } from "../../server/meta.mjs";

function makeRoom(settings = {}) {
  return {
    code: "TEST01",
    seats: [
      { profile: { nickname: "A" }, token: "t0", ws: null },
      { profile: { nickname: "B" }, token: "t1", ws: null },
    ],
    settings: { ...allDefaultSettings(), "${id}": { ...settings } },
    gameId: "${id}",
    game: null,
    journal: [],
    stats: { wins: {} },
    seenCids: [],
  };
}

function start(settings) {
  const room = makeRoom(settings);
  const data = game.create(room);
  room.game = { id: "${id}", run: "run-1", startedAt: Date.now(), data, journaled: false };
  return { room, d: data };
}

describe("${name}（${id}）", () => {
  it("开局状态正确", () => {
    const { d } = start();
    expect(d.phase).toBe("playing");
  });

  it("tap 计一分，攒够轮数结束", () => {
    const { room, d } = start({ rounds: 2 });
    expect(game.action(room, 0, { type: "tap" }, Date.now())).toBeNull();
    expect(d.score).toBe(1);
    expect(game.action(room, 0, { type: "tap" }, Date.now())).toBeNull();
    expect(d.phase).toBe("over");
  });

  it("结算页数据齐全", () => {
    const { room } = start();
    const summary = game.summary(room);
    expect(summary.title).toBe("${name}");
    expect(summary.detail.length).toBeGreaterThan(0);
  });
});
`;

const doc = `# ${name}（\`${id}\`）

> 这份文档只描述这一款游戏。改它的时候不需要读别的游戏。

## 文件

| 作用 | 路径 |
| --- | --- |
| 元数据 / 设置表单 | \`shared/games/${id}.json\` |
| 服务端规则 | \`server/games/${id}.mjs\` |
| 题库 / 数值（可选） | \`server/games/_${id}.data.mjs\` |
| 客户端界面 | \`src/games/${id}.tsx\` |
| 界面样式 | \`src/games/${id}.css\` |
| 单元测试 | \`tests/unit/${id}.test.mjs\` |
| 端到端冒烟 | \`scripts/smoke/${id}.mjs\` |

## 开发闭环

\`\`\`bash
npm run test:game -- ${id}     # 只跑这款游戏的单测
npm run smoke:game -- ${id}    # 只起一台测试服务器，跑这款游戏的端到端
npm run check:games            # 校验四件套
\`\`\`

## 约定

- 服务端默认导出 \`{ create, action, tick?, summary? }\`；\`data.phase === "over"\` 时自动结算。
- 客户端只导出 \`Stage\`（必填）和可选的 \`ResultExtra\`；不要处理 \`phase === "over"\`，由 \`GameStageHost\` 统一渲染结算页。
- 所有规则以服务端为准，客户端只发动作和渲染快照。
- 样式写进 \`${id}.css\`，共用样式留在 \`src/styles.css\`。
`;

const entry = {
  order,
  name,
  emoji,
  tagline: "一句话介绍这个游戏",
  intro: "大厅里展示的详细介绍：怎么玩、适合什么时候玩。",
  rules: ["规则一", "规则二", "规则三"],
  tags: ["合作"],
  duration: "5 分钟",
  net: "延迟友好",
  gradient: [g1, g2],
  settings: [
    {
      type: "select",
      key: "rounds",
      label: "轮数",
      default: 5,
      options: [
        { value: 5, label: "5 轮" },
        { value: 10, label: "10 轮" },
      ],
    },
  ],
};

fs.mkdirSync(metaDir, { recursive: true });
fs.mkdirSync(smokeDir, { recursive: true });
fs.mkdirSync(docsDir, { recursive: true });
fs.writeFileSync(metaFile, JSON.stringify(entry, null, 2) + "\n");
fs.writeFileSync(serverFile, server);
fs.writeFileSync(clientFile, client);
fs.writeFileSync(styleFile, style);
fs.writeFileSync(smokeFile, smoke);
fs.writeFileSync(testFile, unitTest);
fs.writeFileSync(docFile, doc);

console.log(`✓ 已创建游戏 ${id}（${name}）`);
console.log(`  · shared/games/${id}.json`);
console.log(`  · ${path.relative(root, serverFile)}`);
console.log(`  · ${path.relative(root, clientFile)} + ${path.relative(root, styleFile)}`);
console.log(`  · ${path.relative(root, smokeFile)}`);
console.log(`  · ${path.relative(root, testFile)}`);
console.log(`  · ${path.relative(root, docFile)}`);
console.log(`下一步：`);
console.log(`  1. 编辑这些文件，把 ${id} 的规则和界面写出来；`);
console.log(`  2. npm run test:game -- ${id} && npm run smoke:game -- ${id}；`);
console.log(`  3. npm run check:games && npm run build。`);
