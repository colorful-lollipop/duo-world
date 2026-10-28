import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GAMES, GAME_MAP } from "../meta.mjs";

// 约定：server/games/<id>.mjs 默认导出一个游戏对象。
// 文件名就是游戏 id，必须和 shared/games/<id>.json 的文件名一致。
// 新增游戏时只需要放文件，不需要改这里。
const here = path.dirname(fileURLToPath(import.meta.url));
const games = {};

for (const file of fs.readdirSync(here).sort()) {
  if (!file.endsWith(".mjs") || file.startsWith("_") || file === "index.mjs") continue;
  const id = file.slice(0, -".mjs".length);
  const mod = await import(pathToFileURL(path.join(here, file)).href);
  const game = mod.default;

  if (!game || typeof game.create !== "function" || typeof game.action !== "function") {
    throw new Error(`[games] ${file} 必须默认导出 { create, action, tick?, summary? }`);
  }
  for (const fn of ["tick", "summary"]) {
    if (game[fn] !== undefined && typeof game[fn] !== "function") {
      throw new Error(`[games] ${file} 的 ${fn} 必须是函数`);
    }
  }
  if (!GAME_MAP[id]) {
    throw new Error(`[games] ${id} 缺少 shared/games/${id}.json 元数据`);
  }
  if (games[id]) {
    throw new Error(`[games] 重复的 id: ${id}`);
  }
  games[id] = game;
}

for (const meta of GAMES) {
  if (!games[meta.id]) {
    throw new Error(`[games] ${meta.id} 在 shared/games/ 里有元数据，但缺少 server/games/${meta.id}.mjs`);
  }
}

export { games };