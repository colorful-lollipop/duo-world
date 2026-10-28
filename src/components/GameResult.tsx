import type { ReactNode } from "react";
import type { GameMeta, RoomState } from "../types";
import { Icon } from "./Icon";

export function GameResult({
  meta,
  room,
  children,
  onRestart,
  onExit,
  canRestart = true,
}: {
  meta: GameMeta;
  room: RoomState;
  children?: ReactNode;
  onRestart: () => void;
  onExit: () => void;
  canRestart?: boolean;
}) {
  const entry = [...room.journal].reverse().find((j) => j.gameId === meta.id);
  return (
    <div className="result-screen">
      <div className="result-burst" aria-hidden="true">
        <span>💛</span>
        <span>💗</span>
        <span>✨</span>
        <span>🫶</span>
        <span>💫</span>
      </div>
      <div className="result-card" style={{ ["--g1" as string]: meta.gradient[0], ["--g2" as string]: meta.gradient[1] }}>
        <span className="result-emoji" aria-hidden="true">
          {meta.emoji}
        </span>
        <p className="result-eyebrow">这一局结束啦</p>
        <h2>{meta.name}</h2>
        <p className="result-detail">{entry?.detail || "你们又一起完成了一局"}</p>
        {children}
        <p className="result-saved">
          <Icon name="book" size={16} /> 已经记进「我们的纪念册」
        </p>
        <div className="button-row result-actions">
          {canRestart && (
            <button className="primary" onClick={onRestart}>
              <Icon name="refresh" size={18} /> 再来一局
            </button>
          )}
          <button className="secondary" onClick={onExit}>
            <Icon name="home" size={18} /> 回我们的小屋
          </button>
        </div>
      </div>
    </div>
  );
}
