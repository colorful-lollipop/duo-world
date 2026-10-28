// 结构校验：确保每个游戏的「元数据 + 服务端规则 + 客户端界面」三件套齐全。
// npm run build 会在编译前执行它。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GAMES } from "../server/meta.mjs";
import { games } from "../server/games/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientDir = path.join(root, "src", "games");
const errors = [];

const serverIds = Object.keys(games).sort();
const metaIds = GAMES.map((g) => g.id).sort();

for (const g of GAMES) {
  if (!games[g.id]) errors.push(`元数据 ${g.id} 缺少 server/games/${g.id}.mjs`);
  const clientFile = path.join(clientDir, `${g.id}.tsx`);
  if (!fs.existsSync(clientFile)) {
    errors.push(`元数据 ${g.id} 缺少 src/games/${g.id}.tsx`);
  } else {
    const src = fs.readFileSync(clientFile, "utf8");
    if (!/export const Stage/.test(src)) errors.push(`src/games/${g.id}.tsx 缺少 export const Stage`);
  }
  const keys = (g.settings || []).map((s) => s.key);
  if (new Set(keys).size !== keys.length) errors.push(`元数据 ${g.id} 的 settings 有重复 key`);
}

for (const id of serverIds) {
  if (!metaIds.includes(id)) errors.push(`server/games/${id}.mjs 缺少 shared/games.json 元数据`);
}

if (errors.length) {
  console.error("✗ 游戏结构校验失败：\n  - " + errors.join("\n  - "));
  process.exit(1);
}

console.log(`✓ 游戏结构校验通过：${metaIds.length} 个游戏`);
for (const id of metaIds) {
  console.log(`   · ${id.padEnd(14)} ${GAMES.find((g) => g.id === id).name}`);
}
