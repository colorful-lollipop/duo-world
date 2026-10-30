import { useEffect, useRef, useState } from "react";
import type { StageProps, ResultExtraProps } from "./types";
import "./ping-pong.css";

/** Presentation only: the server owns movement, collisions, scores and the clock. */
export const Stage = ({ room, seat, game, meta, act, send, now, latency }: StageProps) => {
  const d = game.data;
  const t = d.tuning;
  const court = useRef<HTMLDivElement>(null);
  const ball = useRef<SVGCircleElement>(null);
  const paddles = useRef<(SVGRectElement | null)[]>([]);
  const input = useRef<{ target: number | null; direction: number }>({ target: null, direction: 0 });
  const current = useRef({ room, seat, d, act, send, now, latency });
  current.current = { room, seat, d, act, send, now, latency };
  const [clock, setClock] = useState(now());
  const connected = room.seats.every((s) => s.connected);
  const active = connected && (d.phase === "playing" || d.phase === "countdown");
  const visual = useRef({ x: d.ball.x, y: d.ball.y, p: [...d.paddles] });
  const motion = useRef({ from: visual.current, to: visual.current, at: performance.now() });

  useEffect(() => {
    const next = { x: d.ball.x, y: d.ball.y, p: [...d.paddles] };
    // Interpolate authoritative snapshots, never extrapolate through a collision or invent a point.
    const reset = d.phase !== "playing";
    motion.current = { from: reset ? next : visual.current, to: next, at: performance.now() };
  }, [d.ball.x, d.ball.y, d.paddles[0], d.paddles[1], d.phase, d.epoch]);

  useEffect(() => {
    input.current = { target: null, direction: 0 };
  }, [d.phase, d.epoch, connected, latency === null, game.run]);

  useEffect(() => {
    let frame = 0;
    const draw = (stamp: number) => {
      const m = motion.current;
      const f = Math.max(0, Math.min(1, (stamp - m.at) / 100));
      const lerp = (a: number, b: number) => a + (b - a) * f;
      const v = { x: lerp(m.from.x, m.to.x), y: lerp(m.from.y, m.to.y), p: m.to.p.map((p: number, i: number) => lerp(m.from.p[i], p)) };
      visual.current = v;
      ball.current?.setAttribute("cx", String(v.x));
      ball.current?.setAttribute("cy", String(v.y));
      v.p.forEach((p: number, i: number) => paddles.current[i]?.setAttribute("y", String(p - current.current.d.tuning.paddleHeight / 2)));
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    const timer = window.setInterval(() => {
      const c = current.current;
      const time = c.now();
      setClock(time);
      // No movement intent is retained while disconnected or while the snapshot is stale.
      if (!c.room.seats.every((s) => s.connected) || time - c.room.now > 1500 || !["playing", "countdown"].includes(c.d.phase)) {
        input.current = { target: null, direction: 0 };
        return;
      }
      const i = input.current;
      if (i.direction) i.target = Math.max(0, Math.min(c.d.tuning.height, (i.target ?? c.d.paddles[c.seat]) + i.direction * 40));
      if (i.target === null) return;
      c.send({ type: "action", transient: "ping-pong", action: { type: "move", y: i.target, epoch: c.d.epoch, at: time } });
      if (!i.direction) i.target = null;
    }, 50);
    const release = () => { input.current = { target: null, direction: 0 }; };
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    return () => { cancelAnimationFrame(frame); clearInterval(timer); window.removeEventListener("blur", release); document.removeEventListener("visibilitychange", release); };
  }, []);

  const pointer = (clientY: number) => {
    if (!active) return;
    const rect = court.current?.getBoundingClientRect();
    if (rect && rect.height > 0) input.current.target = Math.max(0, Math.min(t.height, (clientY - rect.top) / rect.height * t.height));
  };
  const keyDirection = (key: string) => ["ArrowUp", "w", "W"].includes(key) ? -1 : ["ArrowDown", "s", "S"].includes(key) ? 1 : 0;
  const readyPhase = d.phase === "ready" || d.phase === "paused";

  return <section className="stage pong-stage">
    <div className="stage-topline"><span className="game-eyebrow">{meta.emoji} {meta.name}</span><span className="round-chip">先得 {d.target} 分</span></div>
    <div className="pong-scoreboard" aria-live="polite">
      {[0, 1].map((i) => <div key={i} className={`pong-player pong-player-${i}`}><span>{room.seats[i].profile?.nickname || (i === seat ? "我" : "TA")} {i === seat && <small>你 · {i === 0 ? "左" : "右"}侧</small>}</span><strong>{d.scores[i]}</strong></div>)}
      <span className="pong-heart" aria-hidden="true">♥</span>
    </div>
    <div ref={court} className="pong-court" tabIndex={0} role="application" aria-label={`乒乓球场，你控制${seat === 0 ? "左" : "右"}侧球拍。使用上下方向键或 W S，也可拖动球场。`} aria-describedby="pong-instructions"
      onPointerDown={(e) => { if ((e.target as Element).closest("button")) return; e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); pointer(e.clientY); }}
      onPointerMove={(e) => { if (e.pointerType === "mouse" || e.buttons) pointer(e.clientY); }}
      onPointerCancel={() => { input.current = { target: null, direction: 0 }; }}
      onKeyDown={(e) => { const dir = keyDirection(e.key); if (dir) { e.preventDefault(); if (active) input.current.direction = dir; } }}
      onKeyUp={(e) => { if (keyDirection(e.key)) { e.preventDefault(); input.current.direction = 0; input.current.target = null; } }}
      onBlur={() => { input.current = { target: null, direction: 0 }; }}>
      <svg viewBox={`0 0 ${t.width} ${t.height}`} preserveAspectRatio="none" aria-hidden="true">
        <line x1={t.width / 2} y1="0" x2={t.width / 2} y2={t.height} className="pong-net" />
        <circle cx={t.width / 2} cy={t.height / 2} r="75" className="pong-center" />
        {[0, 1].map((i) => <rect key={i} ref={(el) => { paddles.current[i] = el; }} x={i === 0 ? t.paddleInset : t.width - t.paddleInset - t.paddleWidth} y={d.paddles[i] - t.paddleHeight / 2} width={t.paddleWidth} height={t.paddleHeight} rx="9" className={`pong-paddle pong-paddle-${i}`} />)}
        <circle ref={ball} cx={d.ball.x} cy={d.ball.y} r={t.ballRadius} className="pong-ball" />
      </svg>
      {(readyPhase || d.phase === "countdown" || !connected) && <div className="pong-overlay" aria-live="polite">
        <div className="pong-overlay-card">
          <strong>{!connected ? "等 TA 回来，比分替你们保留" : d.phase === "paused" ? "回来了？一起准备继续" : d.phase === "countdown" ? Math.max(1, Math.ceil((d.countdownUntil - clock) / 1000)) : "来一场心跳对决"}</strong>
          {readyPhase && <><p>{d.ready[seat] ? "你已准备好，等 TA 点准备" : "两个人准备好，再一起开球"}</p><button className="primary" disabled={!connected || d.ready[seat]} onClick={() => act({ type: "ready" })}>{d.ready[seat] ? "已准备 ✓" : d.phase === "paused" ? "准备继续" : "我准备好了"}</button></>}
        </div>
      </div>}
    </div>
    <div className="pong-footer"><span>这一回合 <b>{d.rally}</b> 次接球 · 最长 <b>{d.bestRally}</b> 次</span><span>{latency == null ? "正在连接…" : `${latency} ms`}</span></div>
    <p id="pong-instructions" className="pong-instructions">移动鼠标 / 手指拖动球场 · ↑ ↓ 或 W S 控制你的球拍。击中边缘，打出斜线！</p>
    <div className="pong-actions"><span>你在{seat === 0 ? "左" : "右"}侧，两边都可以拖动 · <a href="/licenses/PingPongMultiplayer.txt" target="_blank" rel="noreferrer">开源许可</a></span><button className="ghost" onClick={() => { if (window.confirm("确定让 TA 赢下这一局吗？")) act({ type: "resign" }); }}>认输</button></div>
  </section>;
};

export const ResultExtra = ({ game }: ResultExtraProps) => <p className="result-note">比分 {game.data.scores.join(" : ")} · 最长连续接球 {game.data.bestRally} 次。下局再来！</p>;
