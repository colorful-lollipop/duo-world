// 爱情飞行棋：游戏界面（文件名 = 游戏 id）。
// 结算页由 GameStageHost 统一渲染，这里只处理 phase = "roll" / "event"。
import { Critter } from "../components/Critter";
import { sfx } from "../lib/sound";
import type { ResultExtraProps, StageProps } from "./types";
import "./love-flight.css";

const COLS = 6;

const EVENT_META: Record<string, { emoji: string; kicker: string; action: string; delta?: string }> = {
  truth: { emoji: "💬", kicker: "真心话时间", action: "说完了" },
  task: { emoji: "🎯", kicker: "小任务时间", action: "做完啦" },
  forward: { emoji: "⏩", kicker: "顺风一程", action: "继续", delta: "前进 2 格" },
  back: { emoji: "⏪", kicker: "小插曲", action: "继续", delta: "后退 2 格" },
  swap: { emoji: "🔁", kicker: "换个位置", action: "继续", delta: "和 TA 交换棋子" },
  again: { emoji: "🎲", kicker: "再来一次", action: "再掷一次", delta: "这个回合再掷一次" }
};

/** 6 列蛇形排布：第 0 行左→右，第 1 行右→左…… */
function cellSpot(index: number) {
  const row = Math.floor(index / COLS);
  const col = index % COLS;
  return { row, col: row % 2 === 0 ? col : COLS - 1 - col };
}

export function LoveFlightStage({ room, seat, game, act, meta }: StageProps) {
  const d = game.data;
  const opponent = seat === 0 ? 1 : 0;
  const taName = room.seats[opponent]?.profile?.nickname || "TA";
  const myTurn = d.turn === seat;
  const rows = Math.ceil(d.length / COLS);
  const canRoll = d.phase === "roll" && myTurn;

  const visited = new Set<number>();
  for (const h of d.history || []) {
    visited.add(h.from);
    visited.add(h.to);
  }

  const turnText =
    d.phase === "event"
      ? myTurn
        ? "这张卡是你的，处理完就轮到 TA"
        : `等 ${taName} 处理完这张卡`
      : myTurn
        ? "轮到你了，掷骰子吧"
        : `等 ${taName} 掷骰子`;

  const event = d.phase === "event" ? d.event : null;
  const eventMeta = event ? EVENT_META[event.kind] : null;

  return (
    <section className="stage love-flight-stage" style={{ ["--rows" as string]: rows }}>
      <div className="stage-topline">
        <span className="game-eyebrow">{meta.name}</span>
        <span className="round-chip">
          第 {d.round} 轮 · {d.length} 格
        </span>
      </div>

      <div className="lf-players">
        {[0, 1].map((n) => {
          const p = room.seats[n]?.profile;
          const isTurn = d.turn === n && d.phase !== "over";
          return (
            <div key={n} className={"lf-player" + (isTurn ? " is-turn" : "") + (n === seat ? " me" : "")}>
              <Critter
                avatar={p?.avatar}
                color={p?.color}
                size={34}
                mood={isTurn ? "joy" : (p?.mood ?? "normal")}
                className={isTurn ? "lf-hop" : ""}
              />
              <div className="lf-player-info">
                <b>{p?.nickname || (n === seat ? "你" : "TA")}</b>
                <span>
                  {d.pos[n]} / {d.length - 1} 格 · {d.wins?.[n] ?? 0} 胜
                </span>
              </div>
              {isTurn && <span className="lf-turn-badge">{d.phase === "event" ? "看卡" : "该你了"}</span>}
            </div>
          );
        })}
      </div>

      <p className="lf-turn" aria-live="polite">
        <span className="lf-turn-dot" aria-hidden="true" />
        {turnText}
      </p>

      <div className="lf-board-wrap">
        <div className="lf-board" role="grid" aria-label={`${d.length} 格飞行棋盘`}>
          {d.board.map((cell: any) => {
            const spot = cellSpot(cell.index);
            const here = [0, 1].filter((n) => d.pos[n] === cell.index);
            const last = d.history?.length ? d.history[d.history.length - 1].to : null;
            const kind = cell.kind || "plain";
            const classNames = [
              "lf-cell",
              "k-" + kind,
              visited.has(cell.index) ? "is-visited" : "",
              last === cell.index ? "is-last" : "",
              here.length ? "has-token" : ""
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div
                key={cell.index}
                role="gridcell"
                className={classNames}
                style={{ gridColumn: spot.col + 1, gridRow: spot.row + 1 }}
                aria-label={`第 ${cell.index + 1} 格 ${cell.label}${here.length ? "，有棋子" : ""}`}
              >
                <span className="lf-cell-index">{cell.index}</span>
                <span className="lf-cell-main">
                  {kind === "plain" ? (
                    <i className="lf-dot" aria-hidden="true" />
                  ) : (
                    <span className="lf-cell-emoji" aria-hidden="true">
                      {cell.emoji}
                    </span>
                  )}
                </span>
                <span className="lf-cell-label">{kind === "plain" ? "" : cell.label}</span>
                {here.length > 0 && (
                  <span className="lf-tokens">
                    {here.map((n) => {
                      const p = room.seats[n]?.profile;
                      return (
                        <Critter
                          key={n}
                          avatar={p?.avatar}
                          color={p?.color}
                          size={26}
                          mood={n === d.turn && d.phase !== "over" ? "joy" : "normal"}
                          shadow={false}
                          className={
                            "lf-token" +
                            (n === seat ? " is-mine" : "") +
                            (n === d.turn && d.phase !== "over" ? " is-active" : "")
                          }
                        />
                      );
                    })}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="lf-controls">
        <div className={"lf-die" + (d.dice ? " is-rolled" : "")} key={"die-" + (d.history?.length ?? 0)}>
          <span className="lf-die-face">{d.dice ?? "🎲"}</span>
          <span className="lf-die-caption">{(d.history?.length ?? 0) > 0 ? `${d.history.length} 次` : "待掷"}</span>
        </div>
        <div className="lf-control-main">
          <button
            className="primary lf-roll"
            disabled={!canRoll}
            onClick={() => {
              sfx.tap();
              act({ type: "roll" });
            }}
          >
            {canRoll ? "掷骰子" : d.phase === "event" ? "先处理卡片" : "等 TA 掷骰子"}
          </button>
          <p className="stage-hint lf-hint">
            掷到几走几格 · 踩到事件卡处理完才换人 · 先到终点赢
          </p>
        </div>
      </div>

      {event && eventMeta && (
        <div className="lf-event-layer">
          <article
            className={"lf-event-card k-" + event.kind}
            role="dialog"
            aria-modal="true"
            aria-label={eventMeta.kicker}
          >
            <span className="lf-event-emoji" aria-hidden="true">
              {eventMeta.emoji}
            </span>
            <p className="lf-event-kicker">{eventMeta.kicker}</p>
            <p className="lf-event-text">{event.text}</p>
            {eventMeta.delta && <span className="lf-event-delta">{eventMeta.delta}</span>}
            <button
              className="primary lf-event-button"
              disabled={!myTurn}
              onClick={() => {
                sfx.flip();
                act({ type: "resolve" });
              }}
            >
              {myTurn ? eventMeta.action : `等 ${taName} 处理`}
            </button>
            {!myTurn && <p className="stage-hint">TA 处理完这张卡，就轮到你了。</p>}
          </article>
        </div>
      )}
    </section>
  );
}

export const Stage = LoveFlightStage;

export function ResultExtra({ room, game }: ResultExtraProps) {
  const d = game.data;
  const winner = d.winner === 0 || d.winner === 1 ? d.winner : null;
  const nameOf = (n: number) => room.seats[n]?.profile?.nickname || (n === 0 ? "你" : "TA");
  const closingSeat = d.closing?.forSeat === 0 || d.closing?.forSeat === 1 ? d.closing.forSeat : null;

  return (
    <div className="lf-result">
      <div className="result-stats">
        <div>
          <strong>{d.rolls?.[0] ?? 0}</strong>
          <span>{nameOf(0)} 掷骰</span>
        </div>
        <div>
          <strong>{d.rolls?.[1] ?? 0}</strong>
          <span>{nameOf(1)} 掷骰</span>
        </div>
        <div>
          <strong>{d.events ?? 0}</strong>
          <span>路上遇到的事件</span>
        </div>
        <div>
          <strong>{d.length}</strong>
          <span>格路线</span>
        </div>
      </div>

      {winner !== null && (
        <p className="result-note lf-result-winner">
          {nameOf(winner)} 先到终点，赢下了这一局。
        </p>
      )}

      {d.closing && (
        <div className="lf-closing">
          <span className="lf-closing-tag">
            🎀 {closingSeat === null ? "输家" : nameOf(closingSeat)} 的撒娇卡
          </span>
          <p>{d.closing.text}</p>
        </div>
      )}
    </div>
  );
}
