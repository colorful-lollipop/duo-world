// 测试辅助：构造一个最小可用、无需网络/端口的 room 对象。
// 只给单元测试用，不参与线上代码。
import { allDefaultSettings } from "../../server/meta.mjs";
import { games } from "../../server/games/index.mjs";

const DEFAULT_NICKS = ["小明", "小红"];

/**
 * 构造最小 room：两个座位、默认设置（可用 settings 覆盖，形如 { gomoku: { first: "房主" } }）。
 * @param {{ gameId?: string, settings?: object, nicknames?: [string, string], code?: string }} [opts]
 */
export function makeRoom({ gameId = "gomoku", settings = {}, nicknames = DEFAULT_NICKS, code = "TEST01" } = {}) {
  const [n0, n1] = nicknames;
  return {
    code,
    createdAt: 0,
    updatedAt: 0,
    version: 0,
    seats: [
      {
        profile: { nickname: n0, avatar: "bunny", color: "#FF6B6B", mood: "joy" },
        token: "t0",
        ws: null,
        joinedAt: 0,
        lastSeen: 0,
      },
      {
        profile: { nickname: n1, avatar: "bear", color: "#4D9DFF", mood: "joy" },
        token: "t1",
        ws: null,
        joinedAt: 0,
        lastSeen: 0,
      },
    ],
    settings: { ...allDefaultSettings(), ...settings },
    gameId,
    game: null,
    journal: [],
    stats: { wins: {} },
    seenCids: [],
  };
}

/** 用 room.gameId 对应的游戏模块开始一局，返回 room.game.data。 */
export function startGame(room) {
  const mod = games[room.gameId];
  if (!mod) throw new Error(`未知游戏：${room.gameId}`);
  room.game = {
    id: room.gameId,
    run: "run-1",
    startedAt: 0,
    data: mod.create(room),
    journaled: false,
  };
  return room.game.data;
}
