import { useCallback, useEffect, useRef, useState } from "react";
import type { ResultExtraProps, StageProps } from "./types";
import { Modal } from "../components/Modal";
import { Icon } from "../components/Icon";
import { useNow, formatLeft } from "../lib/useNow";
import { sfx } from "../lib/sound";

const PALETTE = ["#292B3D", "#F05267", "#F5B83D", "#46A77C", "#4099DD", "#9270C4", "#F18B48", "#FFFFFF"];
const SIZES = [4, 10, 22];

interface Stroke {
  id: string;
  color: string;
  size: number;
  points: number[];
}

function cloneStrokes(list: any[]): Stroke[] {
  return (list || []).map((s: any) => ({
    id: String(s.id),
    color: s.color,
    size: Number(s.size) || 8,
    points: Array.isArray(s.points) ? s.points.slice() : [],
  }));
}

export function DrawGuessStage(props: StageProps) {
  const { room, seat, game, act, send, now, subscribe } = props;
  const d = game.data;
  const t = useNow(now, d.phase !== "over", 150);
  const drawer = d.drawer === seat;
  const [color, setColor] = useState(PALETTE[0]);
  const [size, setSize] = useState(10);
  const [eraser, setEraser] = useState(false);
  const [guess, setGuess] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>(cloneStrokes(d.strokes || []));
  const activeRef = useRef<Stroke | null>(null);
  const pendingRef = useRef<number[]>([]);
  const rafRef = useRef(0);
  const lastRun = useRef(game.run);
  const lastRound = useRef(d.round);
  const lastPhase = useRef(d.phase);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 1000, 1000);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, 1000, 1000);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokesRef.current) {
      const p = stroke.points;
      if (p.length < 2) continue;
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      if (p.length === 2) {
        ctx.beginPath();
        ctx.arc(p[0], p[1], Math.max(1.2, stroke.size / 2), 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      for (let i = 2; i < p.length - 2; i += 2) {
        const mx = (p[i] + p[i + 2]) / 2;
        const my = (p[i + 1] + p[i + 3]) / 2;
        ctx.quadraticCurveTo(p[i], p[i + 1], mx, my);
      }
      ctx.lineTo(p[p.length - 2], p[p.length - 1]);
      ctx.stroke();
    }
  }, []);

  const schedulePaint = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      paint();
    });
  }, [paint]);

  useEffect(() => {
    schedulePaint();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [schedulePaint]);

  // 新的一局
  useEffect(() => {
    if (lastRun.current !== game.run) {
      lastRun.current = game.run;
      lastRound.current = d.round;
      strokesRef.current = [];
      activeRef.current = null;
      pendingRef.current = [];
      setGuess("");
      schedulePaint();
    }
  }, [game.run, d.round, schedulePaint]);

  // 新的一轮：清掉画布（服务端也会发 ink-sync）
  useEffect(() => {
    if (lastRound.current !== d.round) {
      lastRound.current = d.round;
      strokesRef.current = [];
      activeRef.current = null;
      pendingRef.current = [];
      schedulePaint();
    }
  }, [d.round, schedulePaint]);

  useEffect(() => setGuess(""), [d.round, game.run]);

  // 接收 TA 的笔迹
  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "ink" && msg.run === game.run) {
        const data = msg.data;
        if (!data) return;
        if (data.op === "start") {
          if (!strokesRef.current.some((s) => s.id === data.id) && strokesRef.current.length < 900) {
            strokesRef.current.push({
              id: data.id,
              color: data.color || "#292B3D",
              size: Number(data.size) || 8,
              points: [],
            });
          }
        } else if (data.op === "points") {
          const stroke = strokesRef.current.find((s) => s.id === data.id);
          if (stroke && Array.isArray(data.points)) {
            for (let i = 0; i + 1 < data.points.length; i += 2) {
              stroke.points.push(Number(data.points[i]), Number(data.points[i + 1]));
            }
          }
        }
        schedulePaint();
      } else if (msg.type === "ink-sync" && msg.run === game.run) {
        strokesRef.current = cloneStrokes(msg.strokes);
        schedulePaint();
      }
    });
  }, [subscribe, game.run, schedulePaint]);

  // 批量发送笔迹
  const flushRef = useRef<() => void>(() => {});
  flushRef.current = () => {
    const stroke = activeRef.current;
    if (!stroke) return;
    const pts = pendingRef.current.splice(0);
    if (pts.length) send({ type: "ink", run: game.run, data: { op: "points", id: stroke.id, points: pts } });
  };

  useEffect(() => {
    const timer = window.setInterval(() => flushRef.current(), 45);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (lastPhase.current !== d.phase) {
      if (d.phase === "reveal") {
        if (d.correct) sfx.correct();
        else sfx.wrong();
      }
      lastPhase.current = d.phase;
    }
  }, [d.phase, d.correct]);

  const stopDrawing = () => {
    if (!activeRef.current) return;
    flushRef.current();
    send({ type: "ink", run: game.run, data: { op: "end", id: activeRef.current.id } });
    activeRef.current = null;
  };

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * 1000;
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) * 1000;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  };

  const remain =
    d.phase === "drawing"
      ? Math.max(0, d.deadline - t)
      : d.phase === "choose"
        ? Math.max(0, d.deadline - t)
        : Math.max(0, (d.revealAt || 0) - t);
  const total = d.phase === "choose" ? 25000 : d.phase === "drawing" ? d.seconds * 1000 : 4500;
  const pct = Math.max(0, Math.min(100, (remain / total) * 100));
  const revealed = d.phase === "reveal" && t >= (d.revealAt || 0);
  const drawerProfile = room.seats[d.drawer]?.profile;
  const letters = d.answer ? `${Array.from(String(d.answer)).length} 个字` : "";

  const canDraw = drawer && d.phase === "drawing";

  return (
    <section className="stage draw-stage">
      <div className="draw-hud">
        <div>
          <span className="round-chip">
            第 {d.round + 1} / {d.rounds} 轮
          </span>
          <span className="draw-score">一起 {d.score} 分</span>
        </div>
        <div className={"timer-chip " + (remain < 10000 && d.phase === "drawing" ? "urgent" : "")}>
          <Icon name="clock" size={16} />
          {d.phase === "choose" ? "选词 " : d.phase === "reveal" ? "揭晓 " : ""}
          {formatLeft(remain)}s
        </div>
      </div>
      <div className="timer-track" aria-hidden="true">
        <span style={{ width: pct + "%" }} />
      </div>

      {d.phase === "choose" ? (
        <div className="word-choices">
          <div className="choose-head">
            <span className="choose-mascot">
              <span className="mini-critter">
                {drawerProfile ? `${drawerProfile.nickname} 当画手` : ""}
              </span>
            </span>
            <h2>{drawer ? "选一个词，画给 TA 猜" : `${drawerProfile?.nickname || "TA"} 正在挑一个词`}</h2>
            <p className="muted">{formatLeft(remain)} 秒后会自动选一个</p>
          </div>
          <div className="choice-cards">
            {d.choices.map((c: any, index: number) => (
              <button
                key={c.w}
                className="choice word-choice"
                disabled={!drawer}
                onClick={() => {
                  sfx.tap();
                  act({ type: "choose", index });
                }}
              >
                <strong>{c.w}</strong>
                <small>
                  <span className="stars">{"★".repeat(c.lvl)}</span> {["简单", "中等", "挑战"][c.lvl - 1]} · {c.lib}
                </small>
              </button>
            ))}
          </div>
          {!drawer && <p className="stage-hint">耐心等一下，TA 马上就开始画了。</p>}
        </div>
      ) : (
        <>
          <div className={"draw-prompt " + (revealed || d.phase === "reveal" ? "is-reveal" : "")}>
            <strong>
              {d.phase === "reveal"
                ? `答案是：${d.answer}`
                : drawer
                  ? `请画：${d.answer}`
                  : `猜猜看 · ${letters}${d.category ? " · " + d.category : ""}`}
            </strong>
            <span>
              {d.phase === "reveal"
                ? d.roundPoints > 0
                  ? `+${d.roundPoints} 分`
                  : "时间到，下一轮再战"
                : drawer
                  ? "别写字，用画的"
                  : "TA 正在画…"}
            </span>
          </div>

          <div className="canvas-frame">
            <canvas
              ref={canvasRef}
              width={1000}
              height={1000}
              className={"drawing-canvas " + (canDraw ? "can-draw" : "")}
              aria-label="双人画板"
              onPointerDown={(e) => {
                if (!canDraw || !drawer) return;
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                const [x, y] = pointFromEvent(e);
                const id =
                  typeof crypto !== "undefined" && "randomUUID" in crypto
                    ? crypto.randomUUID()
                    : Math.random().toString(36).slice(2);
                const useColor = eraser ? "#FFFFFF" : color;
                const useSize = eraser ? 30 : size;
                const stroke: Stroke = { id, color: useColor, size: useSize, points: [x, y] };
                strokesRef.current.push(stroke);
                activeRef.current = stroke;
                pendingRef.current = [x, y];
                send({ type: "ink", run: game.run, data: { op: "start", id, color: useColor, size: useSize } });
                schedulePaint();
              }}
              onPointerMove={(e) => {
                const stroke = activeRef.current;
                if (!stroke) return;
                e.preventDefault();
                const [x, y] = pointFromEvent(e);
                const p = stroke.points;
                if (p.length >= 2) {
                  const dx = x - p[p.length - 2];
                  const dy = y - p[p.length - 1];
                  if (Math.hypot(dx, dy) < 2) return;
                }
                p.push(x, y);
                pendingRef.current.push(x, y);
                if (pendingRef.current.length >= 240) flushRef.current();
                schedulePaint();
              }}
              onPointerUp={stopDrawing}
              onPointerCancel={stopDrawing}
            />
            {!drawer && d.phase === "drawing" && <span className="canvas-live">TA 正在画</span>}
            <span className="canvas-sign" aria-hidden="true">
              二人世界
            </span>
          </div>

          {drawer && d.phase === "drawing" && (
            <div className="draw-tools">
              <div className="ink-palette">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    className={"ink-dot " + (!eraser && color === c ? "active" : "")}
                    style={{ background: c }}
                    aria-label={c === "#FFFFFF" ? "橡皮" : "颜色 " + c}
                    aria-pressed={!eraser && color === c}
                    onClick={() => {
                      setEraser(false);
                      setColor(c);
                    }}
                  />
                ))}
                <button
                  className={"eraser-button " + (eraser ? "active" : "")}
                  aria-pressed={eraser}
                  onClick={() => {
                    setEraser(true);
                    setSize(22);
                  }}
                >
                  橡 皮
                </button>
              </div>
              <div className="draw-tool-row">
                <div className="brush-sizes">
                  {SIZES.map((s, i) => (
                    <button
                      key={s}
                      className={"brush-size " + (!eraser && size === s ? "active" : "")}
                      onClick={() => {
                        setEraser(false);
                        setSize(s);
                      }}
                      aria-label={["细", "中", "粗"][i]}
                    >
                      <span style={{ width: s + 2, height: s + 2 }} />
                    </button>
                  ))}
                </div>
                <button
                  className="secondary small"
                  onClick={() => {
                    strokesRef.current.pop();
                    schedulePaint();
                    act({ type: "undo" });
                  }}
                >
                  <Icon name="undo" size={16} /> 撤销
                </button>
                <button
                  className="secondary small"
                  onClick={() => {
                    if (!strokesRef.current.length) return;
                    setConfirmClear(true);
                  }}
                >
                  <Icon name="trash" size={16} /> 清空
                </button>
              </div>
            </div>
          )}

          {!drawer && d.phase === "drawing" && (
            <form
              className="guess-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!guess.trim()) return;
                sfx.send();
                act({ type: "guess", text: guess });
                setGuess("");
              }}
            >
              <input
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                maxLength={30}
                placeholder="我猜是…"
                aria-label="猜一个词"
              />
              <button className="primary" disabled={!guess.trim()}>
                猜一下
              </button>
            </form>
          )}

          {d.guesses?.length > 0 && (
            <div className="guesses" aria-live="polite">
              {d.guesses.slice(-6).map((g: any, i: number) => (
                <p key={i} className={g.correct ? "correct" : g.near ? "near" : ""}>
                  <span>{g.seat === seat ? "你" : drawer ? "TA" : "你"}</span>
                  {g.text}
                  {g.correct && " · 猜中了！"}
                  {g.near && !g.correct && " · 很接近了"}
                </p>
              ))}
            </div>
          )}

          {d.phase === "reveal" && (
            <div className="draw-reveal">
              <p>
                {d.correct
                  ? `${room.seats[d.correctSeat]?.profile?.nickname || "TA"} 猜中了，一起 +${d.roundPoints} 分`
                  : "这一轮没猜中，答案是 " + d.answer}
              </p>
              <button
                className="primary"
                onClick={() => {
                  sfx.tap();
                  act({ type: "next" });
                }}
              >
                {d.round + 1 >= d.rounds ? "看看这一局" : "下一轮"} →
              </button>
            </div>
          )}
        </>
      )}

      {confirmClear && (
        <Modal title="清空画布？" onClose={() => setConfirmClear(false)}>
          <p className="modal-text">这一笔一画都会消失，确定要重新画吗？</p>
          <div className="button-row">
            <button
              className="primary"
              onClick={() => {
                setConfirmClear(false);
                strokesRef.current = [];
                schedulePaint();
                act({ type: "clear" });
              }}
            >
              确认清空
            </button>
            <button className="secondary" onClick={() => setConfirmClear(false)}>
              再想想
            </button>
          </div>
        </Modal>
      )}

      <p className="stage-hint">
        {drawer ? "用手机画也很顺手，慢慢来。" : "猜错也没关系，多猜几个方向。"} 不用写字，画得像不像都不重要。
      </p>
    </section>
  );
}

export const Stage = DrawGuessStage;

export function ResultExtra({ game }: ResultExtraProps) {
  const d = game.data;
  return (
    <>
      <div className="result-stats">
        <div>
          <strong>{d.score}</strong>
          <span>一起得到的分</span>
        </div>
        <div>
          <strong>{d.correctRounds}</strong>
          <span>猜中轮数</span>
        </div>
      </div>
      <p className="result-note">这一局的分数已经记进纪念册，下次继续挑战。</p>
    </>
  );
}