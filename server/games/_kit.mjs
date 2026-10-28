// 所有游戏通用的服务端小工具。
// 这个文件以 "_" 开头，不会被自动注册器当成游戏加载。

export function otherSeat(seat) {
  return seat === 0 ? 1 : 0;
}

export function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function clampInt(value, min, max, fallback = min) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** 统一的猜词/联想词归一化：去空白、标点、大小写。 */
export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s，。,.!?！？、·~～'"“”‘’：:；;（）()【】[\]]/g, "");
}

/**
 * 通用胜场统计：room.stats.wins[gameId] = [seat0, seat1]。
 * 新游戏不需要改 rooms.mjs，调用它即可。
 */
export function gameWins(room, gameId) {
  if (!room.stats.wins) room.stats.wins = {};
  if (!Array.isArray(room.stats.wins[gameId])) room.stats.wins[gameId] = [0, 0];
  return room.stats.wins[gameId];
}

/** 动作校验的小助手：返回 null 表示通过，字符串表示给玩家看的错误。 */
export function requirePhase(data, phase, message = "现在还不能这么做") {
  return data?.phase === phase ? null : message;
}

export function assertInt(value, min, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}