import type { ComponentType } from "react";
import type { GameMeta, GameState, RoomState } from "../types";

/**
 * 游戏界面约定：
 * - 文件放在 src/games/<id>.tsx，文件名就是游戏 id（和 shared/games.json 一致）。
 * - 默认按需加载：只有打开这个游戏才会下载它的代码。
 * - 导出 `export const Stage = ...`（游戏进行中的界面）。
 * - 可选导出 `export const ResultExtra = ...`（结算页里游戏自己的补充内容，如迷你棋盘）。
 */
export interface StageProps {
  room: RoomState;
  seat: number;
  game: GameState;
  meta: GameMeta;
  act: (action: Record<string, unknown>) => boolean;
  send: (msg: Record<string, unknown>) => boolean;
  now: () => number;
  subscribe: (fn: (msg: any) => void) => () => void;
  /** 最近一次 WebSocket ping 的往返延迟（毫秒），还没测到或断线时为 null。 */
  latency?: number | null;
}

export interface ResultExtraProps {
  room: RoomState;
  seat: number;
  game: GameState;
  meta: GameMeta;
}

export interface StageModule {
  Stage: ComponentType<StageProps>;
  ResultExtra?: ComponentType<ResultExtraProps>;
}

export function otherSeat(seat: number) {
  return seat === 0 ? 1 : 0;
}

export function answerText(question: any, answer: any): string {
  if (answer === null || answer === undefined || answer === "") return "—";
  if (!question) return String(answer);
  if (question.type === "choice") {
    const v = question.options?.[answer];
    return v ?? String(answer);
  }
  if (question.type === "scale") {
    return `${answer} / 100`;
  }
  return String(answer);
}