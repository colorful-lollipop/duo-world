// 脚手架：一条命令生成一个新游戏（服务端规则 + 界面 + 元数据）。
// 用法：node scripts/new-game.mjs <id> <名称> [emoji] [渐变1] [渐变2]
// 例：  node scripts/new-game.mjs red-rope 红绳 🔗 "#FF8A8A" "#E23E57"
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const metaPath = path.join(root, "shared", "games.json");
const serverDir = path.join(root, "server", "games");
const clientDir = path.join(root, "src", "games");

const [, , id, name, emoji = "🎲", g1 = "#FFCB6B", g2 = "#FF9A3C"] = process.argv;

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) fail("id 必须是 kebab-case，例如 checkers / red-rope");
if (!name) fail("需要传游戏名称，例如：node scripts/new-game.mjs red-rope 红绳");

const serverFile = path.join(serverDir, `${id}.mjs`);
const clientFile = path.join(clientDir, `${id}.tsx`);
if (fs.existsSync(serverFile) || fs.existsSync(clientFile)) fail(`文件已存在：${id}`);

const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
if (meta.some((g) => g.id === id)) fail(`shared/games.json 里已有 ${id}`);

const server = `// ${name}：服务端规则（文件名 = 游戏 id）
// 会自动被 server/games/index.mjs 发现，不需要改任何中央文件。
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
import { useState } from "react";
import type { StageProps } from "./types";

function GameStage(props: StageProps) {
  const { game, act, meta } = props;
  const d = game.data;
  const [local, setLocal] = useState(0);

  return (
    <section className="stage">
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

const entry = {
  id,
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

meta.push(entry);
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
fs.writeFileSync(serverFile, server);
fs.writeFileSync(clientFile, client);

console.log(`✓ 已创建游戏 ${id}（${name}）`);
console.log(`  · shared/games.json 已登记`);
console.log(`  · ${path.relative(root, serverFile)}`);
console.log(`  · ${path.relative(root, clientFile)}`);
console.log(`下一步：`);
console.log(`  1. 编辑这两个文件，把 ${id} 的规则和界面写出来；`);
console.log(`  2. npm run check:games 校验；`);
console.log(`  3. npm run build && npm start 在浏览器里试玩。`);
