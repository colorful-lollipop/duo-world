import { useEffect, useState } from "react";
import "./checkers.css";
import type { ResultExtraProps, StageProps } from "./types";
import { Critter } from "../components/Critter";
import { Modal } from "../components/Modal";
import { Icon } from "../components/Icon";
import { sfx } from "../lib/sound";

function seatOf(p: number) {
  return p < 0 ? -1 : p & 1;
}
function isKing(p: number) {
  return p >= 2;
}
function countPieces(board: number[], seat: number) {
  let n = 0;
  for (const p of board) if (seatOf(p) === seat) n++;
  return n;
}

export function CheckersStage(props: StageProps) {
  const { room, seat, game, act } = props;
  const d = game.data;
  const [selected, setSelected] = useState<number | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const myTurn = d.phase === "playing" && d.turn === seat;
  const flip = seat === 1;
  const legal = d.legal || {};
  const pending = d.pending;

  useEffect(() => {
    setSelected(d.chainFrom ?? null);
  }, [d.chainFrom, d.turn, d.moveCount, game.run]);

  const moves = selected !== null ? legal[selected] || [] : [];
  const dest = new Set(moves.map((m: any) => m.to));
  const captureDest = new Set(moves.filter((m: any) => m.captures.length > 0).map((m: any) => m.to));
  const order = Array.from({ length: 64 }, (_, i) => (flip ? 63 - i : i));
  const myCount = countPieces(d.board, seat);
  const oppCount = countPieces(d.board, 1 - seat);
  const chain = d.chainFrom !== null;
  const allCaptures =
    myTurn &&
    Object.values(legal).some((ms: any) => ms.some((m: any) => m.captures.length > 0));

  const onCell = (i: number) => {
    if (!myTurn || pending) return;
    const piece = d.board[i];
    if (dest.has(i)) {
      sfx.tap();
      act({ type: "move", from: selected, to: i });
      return;
    }
    if (chain) {
      setSelected(d.chainFrom);
      return;
    }
    if (legal[i]) {
      setSelected(selected === i ? null : i);
      return;
    }
    if (piece >= 0 && seatOf(piece) === seat) setSelected(i);
    else setSelected(null);
  };

  return (
    <section className="stage checkers-stage">
      <div className="gomoku-players">
        {[0, 1].map((n) => {
          const p = room.seats[n]?.profile;
          const isTurn = d.turn === n && d.phase === "playing";
          const count = countPieces(d.board, n);
          return (
            <div className={"gomoku-player " + (isTurn ? "turn" : "") + (n === seat ? " me" : "")} key={n}>
              <Critter avatar={p?.avatar} color={p?.color} size={48} mood={isTurn ? "joy" : (p?.mood ?? "normal")} className={isTurn ? "hop" : ""} />
              <div className="gomoku-player-text">
                <b>{n === seat ? "你" : p?.nickname || "TA"}</b>
                <span>
                  <i className="stone-dot" style={{ background: p?.color }} /> {count} 子 · {d.wins?.[n] ?? 0} 胜
                </span>
              </div>
              {isTurn && <span className="turn-badge">走棋中</span>}
            </div>
          );
        })}
      </div>

      <div className="stage-score">
        <span>
          {myTurn ? (chain ? "继续跳吃，必须接着跳" : "轮到你走棋") : `等 ${room.seats[d.turn]?.profile?.nickname || "TA"} 走棋`}
        </span>
        <div className="checkers-score-right">
          <button type="button" className="text-button checkers-help" onClick={() => setRulesOpen(true)}>
            怎么玩？
          </button>
          <b>第 {d.moveCount + 1} 手</b>
        </div>
      </div>

      <div className="checkers-board-wrap">
        <div className={"checkers-board" + (myTurn ? " my-turn" : "")} role="grid" aria-label="八乘八跳棋棋盘">
          {order.map((i) => {
            const r = Math.floor(i / 8);
            const c = i % 8;
            const dark = (r + c) % 2 === 1;
            const piece = d.board[i];
            const isSel = selected === i;
            const isDest = dest.has(i);
            const mine = piece >= 0 && seatOf(piece) === seat;
            return (
              <button
                key={i}
                role="gridcell"
                className={
                  "checker-cell " +
                  (dark ? "dark" : "light") +
                  (isSel ? " selected" : "") +
                  (d.last?.to === i ? " last-to" : "") +
                  (isDest ? " is-dest" : "")
                }
                disabled={!myTurn || !!pending}
                onClick={() => onCell(i)}
                aria-label={`第 ${r + 1} 行第 ${c + 1} 列${mine ? "，你的棋子" : ""}`}
              >
                {piece >= 0 && (
                  <span
                    className={"checker-piece" + (mine ? " mine" : "")}
                    style={{ ["--pc" as string]: room.seats[seatOf(piece)]?.profile?.color }}
                  >
                    {isKing(piece) ? <span className="crown">♛</span> : null}
                  </span>
                )}
                {isDest && <span className={"move-marker" + (captureDest.has(i) ? " capture" : "")} />}
              </button>
            );
          })}
        </div>
      </div>

      <p className="stage-hint gomoku-hint">
        {chain
          ? "吃子后必须继续跳，点击下一个目标格。"
          : allCaptures && d.mandatory
            ? "有子可吃，这一手必须吃子。"
            : "斜着走 · 普通子只能往前 · 到底线变王（可后退，一格） · 斜着跳过敌子吃 · 吃完还能吃就继续"}
      </p>

      {rulesOpen && (
        <Modal title="爱心跳棋怎么玩？" onClose={() => setRulesOpen(false)}>
          <ul className="checkers-rules-list">
            <li>所有棋子都只能斜着走。</li>
            <li>普通棋子只能往前走。</li>
            <li>走到底线就变成王，王可以往后走；但一次也只走一格。</li>
            <li>斜前方隔着对方棋子、后面是空格，就可以跳过去吃子。</li>
            <li>吃了一个还能继续吃，就再跳一次。</li>
            <li>默认有子可吃时必须吃；轮到谁谁走棋。</li>
          </ul>
          {d.wager && (
            <p className="checkers-wager">
              小约定：<b>{d.wager}</b>
            </p>
          )}
          <div className="button-row">
            <button className="primary" onClick={() => setRulesOpen(false)}>
              知道啦，开始下棋
            </button>
          </div>
        </Modal>
      )}

      {pending ? (
        <div className="agreement pending-box">
          <p>
            {pending.by === seat ? "你" : room.seats[pending.by]?.profile?.nickname || "TA"} 想和棋
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
                再下几手
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="game-actions">
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

export const Stage = CheckersStage;

export function ResultExtra({ room, game }: ResultExtraProps) {
  const d = game.data;
  const winnerName =
    d.winner === null || d.winner === undefined ? null : room.seats[d.winner]?.profile?.nickname;
  return (
    <div className="result-gomoku">
      <div className="mini-board-wrap">
        <div className="mini-checkers">
          {Array.from({ length: 64 }, (_, i) => {
            const r = Math.floor(i / 8);
            const c = i % 8;
            const piece = d.board[i];
            return (
              <span key={i} className={"sq " + ((r + c) % 2 === 1 ? "dark" : "light")}>
                {piece >= 0 && (
                  <i
                    className="p"
                    style={{ ["--pc" as string]: room.seats[seatOf(piece)]?.profile?.color }}
                  >
                    {isKing(piece) ? "♛" : ""}
                  </i>
                )}
              </span>
            );
          })}
        </div>
        <span className="mini-board-label">
          {d.draw ? "最终棋盘 · 平局" : winnerName ? `最终棋盘 · ${winnerName} 清空了对方` : "最终棋盘"}
        </span>
      </div>
    </div>
  );
}