import { useState } from "react";
import type { ResultExtraProps, StageProps } from "./types";
import { Critter } from "../components/Critter";
import { Modal } from "../components/Modal";
import { Icon } from "../components/Icon";
import { sfx } from "../lib/sound";

function MiniBoard({ board, line, size = 232 }: { board: number[]; line: number[]; size?: number }) {
  const step = 300 / 15;
  const set = new Set(line);
  return (
    <svg className="mini-board" width={size} height={size} viewBox="0 0 300 300" aria-label="最终棋盘">
      <rect width="300" height="300" rx="10" fill="#F0D09A" />
      {Array.from({ length: 15 }, (_, i) => (
        <g key={i} stroke="#B98B4E" strokeWidth="1.4">
          <line x1={step / 2} y1={step / 2 + i * step} x2={300 - step / 2} y2={step / 2 + i * step} />
          <line x1={step / 2 + i * step} y1={step / 2} x2={step / 2 + i * step} y2={300 - step / 2} />
        </g>
      ))}
      {board.map((v, i) => {
        if (v < 0) return null;
        const x = step / 2 + (i % 15) * step;
        const y = step / 2 + Math.floor(i / 15) * step;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={step * 0.4}
            fill={v === 0 ? "#FF6B6B" : "#4D9DFF"}
            stroke={set.has(i) ? "#FFD23F" : "#3A2618"}
            strokeWidth={set.has(i) ? 3 : 1.6}
          />
        );
      })}
    </svg>
  );
}

export function GomokuStage(props: StageProps) {
  const { room, seat, game, act } = props;
  const d = game.data;
  const [preview, setPreview] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [coarse] = useState(
    () => typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || navigator.maxTouchPoints > 0),
  );

  const myTurn = d.turn === seat;
  const lineSet = new Set<number>(d.line || []);
  const pending = d.pending;
  const lastIndex = d.last ? d.last.y * 15 + d.last.x : -1;
  const activePreview = coarse ? preview : hover;

  const place = (i: number) => {
    if (d.board[i] !== -1 || !myTurn || pending) return;
    if (coarse && preview !== i) {
      setPreview(i);
      sfx.tap();
      return;
    }
    sfx.tap();
    act({ type: "place", x: i % 15, y: Math.floor(i / 15) });
    setPreview(null);
    setHover(null);
  };

  return (
    <section className="stage gomoku-stage">
      <div className="gomoku-players">
        {[0, 1].map((n) => {
          const p = room.seats[n]?.profile;
          const isTurn = d.turn === n;
          return (
            <div className={"gomoku-player " + (isTurn ? "turn" : "") + (n === seat ? " me" : "")} key={n}>
              <Critter avatar={p?.avatar} color={p?.color} size={48} mood={isTurn ? "joy" : "normal"} className={isTurn ? "hop" : ""} />
              <div className="gomoku-player-text">
                <b>{n === seat ? "你" : p?.nickname || "TA"}</b>
                <span>
                  <i className="stone-dot" style={{ background: p?.color }} /> {d.wins?.[n] ?? 0} 胜
                </span>
              </div>
              {isTurn && <span className="turn-badge">落子中</span>}
            </div>
          );
        })}
      </div>

      <div className="stage-score">
        <span>{myTurn ? "轮到你落子" : `等 ${room.seats[d.turn]?.profile?.nickname || "TA"} 落子`}</span>
        <b>第 {d.move + 1} 手</b>
      </div>

      <div className="gomoku-board-wrap">
        <div className={"gomoku-board" + (myTurn ? " my-turn" : "")} role="grid" aria-label="十五乘十五棋盘">
          {d.board.map((v: number, i: number) => {
            const isPreview = activePreview === i && v === -1 && myTurn && !pending;
            return (
              <button
                key={i}
                role="gridcell"
                className={
                  "gomoku-cell" +
                  (lineSet.has(i) ? " winning" : "") +
                  (lastIndex === i ? " last-move" : "") +
                  (preview === i ? " previewing" : "")
                }
                aria-label={`${(i % 15) + 1} 列 ${Math.floor(i / 15) + 1} 行${v >= 0 ? "，已有棋子" : ""}`}
                disabled={v !== -1 || !myTurn || !!pending}
                onMouseEnter={() => !coarse && setHover(i)}
                onMouseLeave={() => !coarse && setHover(null)}
                onClick={() => place(i)}
              >
                {(v >= 0 || isPreview) && (
                  <span
                    className={"stone " + (v >= 0 ? "placed" : "ghost")}
                    style={{ background: v >= 0 ? room.seats[v]?.profile?.color : room.seats[seat]?.profile?.color }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <p className="stage-hint gomoku-hint">
        {coarse ? "点一下预览，再点同一格落子。" : "点击空格落子。"}
        {d.wager && (
          <>
            {" "}
            小约定：<b>{d.wager}</b>
          </>
        )}
      </p>

      {pending ? (
        <div className="agreement pending-box">
          <p>
            {pending.by === seat ? "你" : room.seats[pending.by]?.profile?.nickname || "TA"} 想
            {pending.kind === "undo" ? "悔一步棋" : "和棋"}
          </p>
          {pending.by === seat ? (
            <button className="secondary" onClick={() => act({ type: "cancel" })}>
              取消请求
            </button>
          ) : (
            <div className="button-row">
              <button
                className="primary"
                onClick={() => {
                  sfx.tap();
                  act({ type: "accept" });
                }}
              >
                好呀，同意
              </button>
              <button className="secondary" onClick={() => act({ type: "decline" })}>
                不行
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="game-actions">
          <button
            className="secondary small"
            disabled={!d.moves?.length || d.moves[d.moves.length - 1]?.seat !== seat}
            onClick={() => {
              sfx.tap();
              act({ type: "undo" });
            }}
          >
            <Icon name="undo" size={16} /> 悔一步
          </button>
          <button className="secondary small" onClick={() => act({ type: "draw" })}>
            求和棋
          </button>
          <button className="text-button" onClick={() => setConfirmResign(true)}>
            认输
          </button>
        </div>
      )}

      {confirmResign && (
        <Modal title="确定认输吗？" onClose={() => setConfirmResign(false)}>
          <p className="modal-text">这一局算 TA 赢，小约定可就要兑现啦。</p>
          <div className="button-row">
            <button
              className="primary"
              onClick={() => {
                setConfirmResign(false);
                act({ type: "resign" });
              }}
            >
              愿赌服输
            </button>
            <button className="secondary" onClick={() => setConfirmResign(false)}>
              再拼一下
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

export const Stage = GomokuStage;

export function ResultExtra({ room, game }: ResultExtraProps) {
  const d = game.data;
  const winnerName = d.winner !== null && d.winner !== undefined ? room.seats[d.winner]?.profile?.nickname : null;
  return (
    <div className="result-gomoku">
      <div className="mini-board-wrap">
        <MiniBoard board={d.board} line={d.line || []} />
        <span className="mini-board-label">
          {d.draw ? "最终棋盘 · 平局" : winnerName ? `最终棋盘 · ${winnerName} 连成五子` : "最终棋盘"}
        </span>
      </div>
    </div>
  );
}