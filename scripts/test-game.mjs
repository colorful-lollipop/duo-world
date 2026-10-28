// 单游戏单元测试：npm run test:game -- brothers
// 只跑 tests/unit/<id>.test.mjs，不加载别的游戏，迭代一款游戏时上下文更小。
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GAMES } from "../server/meta.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const id = process.argv[2];
const ids = GAMES.map((g) => g.id);

if (!id || id.startsWith("-")) {
  console.error("用法：npm run test:game -- <game-id>");
  console.error("可选：" + ids.join(", "));
  process.exit(1);
}
if (!ids.includes(id)) {
  console.error(`✗ 没有这个游戏：${id}\n  可选：${ids.join(", ")}`);
  process.exit(1);
}

const testFile = path.join(root, "tests", "unit", `${id}.test.mjs`);
if (!fs.existsSync(testFile)) {
  console.error(`✗ 缺少 tests/unit/${id}.test.mjs（可参考同目录下别的游戏测试）`);
  process.exit(1);
}

const bin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vitest.cmd" : "vitest");
const child = spawn(bin, ["run", `tests/unit/${id}.test.mjs`], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
