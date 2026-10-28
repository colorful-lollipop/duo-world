import type { StageModule } from "./types";

/**
 * 按需加载注册表：src/games/<id>.tsx 的文件名就是游戏 id。
 * Vite 会把每个游戏拆成独立 chunk，只有在真正开局时才下载那一款。
 */
const loaders = import.meta.glob<StageModule>([
  "./*.tsx",
  "!./GameStageHost.tsx",
  "!./_template.tsx",
]);

export const gameLoaders: Record<string, () => Promise<StageModule>> = {};

for (const [path, loader] of Object.entries(loaders)) {
  const id = path.replace(/^\.\//, "").replace(/\.tsx$/, "");
  if (id.startsWith("_")) continue;
  gameLoaders[id] = loader;
}

/** 已经加载过的游戏模块缓存，重复开局不用再下载。 */
const cache = new Map<string, StageModule>();

export function loadGameModule(id: string): Promise<StageModule> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  const loader = gameLoaders[id];
  if (!loader) return Promise.reject(new Error(`没有这个游戏模块: ${id}`));
  return loader().then((mod) => {
    if (!mod?.Stage) {
      throw new Error(`游戏模块缺少 Stage 导出: ${id}`);
    }
    cache.set(id, mod);
    return mod;
  });
}

export function getCachedGameModule(id: string): StageModule | null {
  return cache.get(id) || null;
}