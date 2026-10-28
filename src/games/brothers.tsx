import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./brothers.css";
import type { StageProps, ResultExtraProps } from "./types";
import { Icon } from "../components/Icon";

interface Platform {
  x: number;
  w: number;
  y: number;
  spike: boolean;
}

interface Tuning {
  jumpMin: number;
  jumpMax: number;
  chargeMs: number;
  cooldownMs: number;
  pullCooldownMs: number;
  jumpMs: number;
  pullMs: number;
}

interface JumpFx {
  seat: number;
  from: number;
  to: number;
  fromY: number;
  toY: number;
  startedAt: number;
  ms: number;
  result: "land" | "hang" | "finish";
}

interface PullFx {
  seat: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startedAt: number;
  ms: number;
}

interface Monkey {
  x: number;
  y: number;
  alive: boolean;
  finished: boolean;
  cooldownUntil: number;
  lastJumpAt: number;
  pullReadyAt?: number;
}

interface BrothersData {
  platforms: Platform[];
  finishX: number;
  baseY: number;
  rope: number;
  tuning: Tuning;
  mon: Monkey[];
  phase: string;
  overReason: string;
  lastJump: (JumpFx | null)[];
  lastPull: (PullFx | null)[];
  falls: number;
  rescued: number;
  pulls: number;
  jumps: number;
  distance: number;
  deadline: number;
  startedAt: number;
  count: number;
  spikes: boolean;
}

const VIEW_H = 400;
const HAND_OFFSET = 46; // 手（绳子挂点）离脚的高度
const HANG_DROP = 54; // 挂着时脚在平台下方多少
const ARC = 84; // 跳跃弧线高度
/** 世界坐标 → 「米」：一格平台大约 30px，看着更像真的走了几百米 */
const METERS = 30;

function platformAt(platforms: Platform[], x: number) {
  for (const p of platforms) {
    if (x >= p.x && x <= p.x + p.w) return p;
  }
  return null;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

interface Prediction {
  fromX: number;
  hold: number;
  power: number;
  dist: number;
  to: number;
  land: Platform | null;
  safe: boolean;
  finished: boolean;
}

/** 和服务器完全一致的落点预测（常量全部来自 d.tuning）。 */
function predict(d: BrothersData, fromX: number, hold: number): Prediction {
  const t = d.tuning;
  const h = Math.max(0, Math.min(t.chargeMs, hold));
  const power = h / t.chargeMs;
  const dist = Math.round(t.jumpMin + (t.jumpMax - t.jumpMin) * power);
  let to = fromX + dist;
  let land = platformAt(d.platforms, to);
  if (!land && to >= d.finishX) {
    // 冲过头：和服务端一样，算踩到终点线
    to = d.finishX;
    land = platformAt(d.platforms, d.finishX);
  }
  const safe = !!land && !land.spike;
  return { fromX, hold: h, power, dist, to, land, safe, finished: safe && to >= d.finishX };
}

/** 约 30fps 的重绘节拍，够顺滑又不至于把两核小机器烤热。 */
function useBeat() {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (ts: number) => {
      if (ts - last > 32) {
        last = ts;
        setT(Date.now());
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return t;
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, size };
}

function isSpaceBlocked(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || tag === "A") return true;
  return el.isContentEditable;
}

function MonkeyBody({
  feetX,
  feetY,
  scale,
  color,
  pose,
  swing = 0,
  glow = false,
}: {
  feetX: number;
  feetY: number;
  scale: number;
  color: string;
  pose: "idle" | "jump" | "hang";
  swing?: number;
  glow?: boolean;
}) {
  const ink = "#3A2618";
  const fur = "#A9744F";
  const furDark = "#8B5E3C";
  const face = "#F6E3C5";
  const arms =
    pose === "idle"
      ? "M-10 -14 L-13 -3 M10 -14 L13 -3"
      : pose === "hang"
        ? "M-8 -34 L-11 -52 M8 -34 L11 -52 M-9 -12 L-13 0 M9 -12 L13 0"
        : "M-8 -34 L-16 -46 M8 -34 L16 -46";
  return (
    <g transform={`translate(${feetX} ${feetY}) scale(${scale})`}>
      {/* 以手（0,-54）为轴摆动：挂着的时候像钟摆 */}
      <g transform={`rotate(${swing} 0 -54)`}>
        {glow && <ellipse cx="0" cy="-26" rx="30" ry="34" fill={color} opacity="0.16" />}
        {/* 尾巴 */}
        <path
          d="M4 -18 C 26 -20 30 -34 20 -42"
          fill="none"
          stroke={ink}
          strokeWidth="3.4"
          strokeLinecap="round"
        />
        {/* 身体 */}
        <ellipse cx="0" cy="-24" rx="14" ry="16.5" fill={fur} stroke={ink} strokeWidth="2.6" />
        <ellipse cx="0" cy="-21" rx="8" ry="10" fill={face} opacity="0.55" stroke="none" />
        {/* 耳朵 */}
        <circle cx="-12" cy="-46" r="6" fill={furDark} stroke={ink} strokeWidth="2.4" />
        <circle cx="12" cy="-46" r="6" fill={furDark} stroke={ink} strokeWidth="2.4" />
        {/* 头 */}
        <circle cx="0" cy="-42" r="12.5" fill={fur} stroke={ink} strokeWidth="2.6" />
        {/* 脸 */}
        <ellipse cx="0" cy="-38" rx="8.6" ry="7.4" fill={face} stroke="none" />
        <circle cx="-3.6" cy="-44" r="1.9" fill={ink} />
        <circle cx="4" cy="-44" r="1.9" fill={ink} />
        <path d="M-2.4 -37.4 Q0 -35.4 2.6 -37.4" fill="none" stroke={ink} strokeWidth="1.7" strokeLinecap="round" />
        {/* 围巾：用座位色区分两只猴子 */}
        <rect x="-12" y="-30" width="24" height="5.6" rx="2.8" fill={color} stroke={ink} strokeWidth="1.8" />
        {/* 手脚 */}
        <path d={arms} stroke={ink} strokeWidth="3" strokeLinecap="round" fill="none" />
      </g>
    </g>
  );
}

interface Vis {
  x: number;
  feetWorld: number;
  handWorld: number;
  hang: boolean;
  pose: "idle" | "jump" | "hang";
  swing: number;
  jumping: boolean;
}

export const Stage = ({ room, seat, game, act, now }: StageProps) => {
  const d = game.data as BrothersData;
  const tuning = d.tuning;
  const beat = useBeat();
  const { ref: worldRef, size } = useSize<HTMLDivElement>();
  const [chargeStart, setChargeStart] = useState<number | null>(null);
  const serverNow = now();

  const mine = d.mon[seat];
  const mate = d.mon[1 - seat];

  const width = size.w || 720;
  const height = size.h || 320;
  const viewW = width < 560 ? 520 : 900;
  const scale = Math.max(0.4, Math.min(1.5, Math.min(width / viewW, height / VIEW_H)));
  const groundY = height - Math.max(20, height * 0.13);

  // 镜头跟着两个人的中点：谁跳出去都能看见，挂绳的时候也不会跑出画面。
  const focus = (d.mon[0].x + d.mon[1].x) / 2;
  const camera = Math.max(-20, focus - viewW / 2);
  const toX = useCallback((x: number) => (x - camera) * scale, [camera, scale]);
  const toY = useCallback((y: number) => groundY - (d.baseY + y) * scale, [d.baseY, groundY, scale]);

  const getVis = useCallback(
    (i: number): Vis => {
      const m = d.mon[i];
      // 被拉上来的人：从挂点滑到同伴的平台
      const pull = d.lastPull?.[1 - i];
      if (pull) {
        const p = (serverNow - pull.startedAt) / pull.ms;
        if (p >= 0 && p < 1) {
          const e = 1 - Math.pow(1 - p, 2);
          const x = pull.fromX + (pull.toX - pull.fromX) * e;
          const feet = pull.fromY - HANG_DROP + (pull.toY - (pull.fromY - HANG_DROP)) * e + Math.sin(Math.PI * p) * 44;
          return { x, feetWorld: feet, handWorld: feet + HAND_OFFSET, hang: false, pose: "jump", swing: 0, jumping: true };
        }
      }
      // 每个人各自插值自己的跳跃，两个人可以同时在空中
      const j = d.lastJump?.[i];
      if (j) {
        const p = (serverNow - j.startedAt) / j.ms;
        if (p >= 0 && p < 1) {
          const x = j.from + (j.to - j.from) * p;
          const base = j.fromY + (j.toY - j.fromY) * p;
          const feet = base + Math.sin(Math.PI * p) * ARC;
          return { x, feetWorld: feet, handWorld: feet + HAND_OFFSET, hang: false, pose: "jump", swing: 0, jumping: true };
        }
      }
      if (!m.alive) {
        const swing = Math.sin(beat / 260 + i * 1.9) * 9;
        const swayX = Math.sin(beat / 300 + i * 1.3) * 4;
        return {
          x: m.x + swayX,
          feetWorld: m.y - HANG_DROP,
          handWorld: m.y,
          hang: true,
          pose: "hang",
          swing,
          jumping: false,
        };
      }
      return { x: m.x, feetWorld: m.y, handWorld: m.y + HAND_OFFSET, hang: false, pose: "idle", swing: 0, jumping: false };
    },
    [d.mon, d.lastJump, d.lastPull, serverNow, beat],
  );

  const vis = [getVis(0), getVis(1)];
  const myVis = vis[seat];
  const mateVis = vis[1 - seat];

  const cooling = Math.max(0, (mine.cooldownUntil || 0) - serverNow);
  const canJumpNow =
    d.phase === "playing" && mine.alive && !mine.finished && cooling <= 0 && !myVis.jumping;
  const canStartRef = useRef(canJumpNow);
  canStartRef.current = canJumpNow;
  const tuningRef = useRef(tuning);
  tuningRef.current = tuning;
  const chargeRef = useRef<number | null>(null);

  const startCharge = useCallback(() => {
    if (!canStartRef.current || chargeRef.current !== null) return;
    const started = Date.now();
    chargeRef.current = started;
    setChargeStart(started);
  }, []);

  const release = useCallback(() => {
    const started = chargeRef.current;
    if (started === null) return;
    chargeRef.current = null;
    setChargeStart(null);
    const hold = Math.max(0, Math.min(tuningRef.current.chargeMs, Date.now() - started));
    act({ type: "jump", hold });
  }, [act]);

  const cancelCharge = useCallback(() => {
    if (chargeRef.current === null) return;
    chargeRef.current = null;
    setChargeStart(null);
  }, []);

  useEffect(() => {
    if (!canJumpNow && chargeRef.current !== null) {
      chargeRef.current = null;
      setChargeStart(null);
    }
  }, [canJumpNow]);

  // 松手可能在舞台外（指针捕获/窗口失焦），统一在 window 收口
  useEffect(() => {
    if (chargeStart === null) return;
    const up = () => release();
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancelCharge);
    window.addEventListener("blur", cancelCharge);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancelCharge);
      window.removeEventListener("blur", cancelCharge);
    };
  }, [chargeStart, release, cancelCharge]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      if (isSpaceBlocked(e.target)) return;
      e.preventDefault();
      startCharge();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (isSpaceBlocked(e.target)) return;
      e.preventDefault();
      release();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [startCharge, release]);

  const charging = chargeStart !== null;
  const chargeHold = charging ? Math.max(0, Math.min(tuning.chargeMs, beat - chargeStart)) : 0;
  const preview = useMemo(
    () => (charging && mine.alive && !mine.finished ? predict(d, mine.x, chargeHold) : null),
    [charging, d, mine.x, mine.alive, mine.finished, chargeHold],
  );

  const progress = clamp01(d.distance / Math.max(1, d.finishX));
  const secondsLeft = Math.max(0, Math.round((d.deadline - serverNow) / 1000));
  const myColor = room.seats[seat]?.profile?.color || "#FF6B6B";
  const mateColor = room.seats[1 - seat]?.profile?.color || "#4D9DFF";
  const myName = room.seats[seat]?.profile?.nickname || "你";
  const mateName = room.seats[1 - seat]?.profile?.nickname || "TA";

  const canPull = d.phase === "playing" && mine.alive && !mate.alive && !myVis.jumping;
  const pullCooling = Math.max(0, (mine.pullReadyAt || 0) - serverNow);
  const pullDistance = Math.abs(mine.x - mate.x);

  const status = (() => {
    if (d.phase !== "playing") return "这一局结束啦";
    if (!mine.alive) return "🪢 你挂在绳子上，等 TA 拉你";
    if (mine.finished) return mate.finished ? "🎉 两个人都到终点啦" : "🎉 你到终点啦，随时能拉 TA 一把";
    if (myVis.jumping) return "在空中…";
    if (!mate.alive) return "TA 挂在绳子上了 · 按下面的按钮拉一把";
    if (cooling > 0) return "刚落地，稳一下…";
    if (charging) return `蓄力中 ${Math.round((chargeHold / tuning.chargeMs) * 100)}% · 松开起跳`;
    return "按住蓄力 · 轻点小跳 · 长按远跳";
  })();

  const myLabel = mine.finished ? "你 · 到了" : mine.alive ? "你" : "你 · 挂着";
  const mateLabel = mate.finished ? "TA · 到了" : mate.alive ? "TA" : "TA · 挂着";

  // 绳子：松的时候下垂，拉紧时绷直、变粗、发光
  const ax = toX(myVis.x);
  const ay = toY(myVis.handWorld);
  const bx = toX(mateVis.x);
  const by = toY(mateVis.handWorld);
  const ropeDist = Math.abs(d.mon[0].x - d.mon[1].x);
  const ropeHang = !d.mon[0].alive || !d.mon[1].alive;
  const tension = ropeHang ? 1 : clamp01(ropeDist / Math.max(1, d.rope));
  const sag = tension >= 0.999 ? 0 : (1 - tension) * (24 + 30 * (1 - tension)) * scale;
  const midX = (ax + bx) / 2 + (ropeHang ? Math.sin(beat / 70) * 1.5 : Math.sin(beat / 620) * 2);
  const midY = (ay + by) / 2 + sag;
  const ropeD = `M${ax} ${ay} Q ${midX} ${midY} ${bx} ${by}`;
  const ropeW = Math.max(2, (2.2 + tension * 2.6) * Math.max(0.8, scale));
  const ropeTaut = tension > 0.62;

  const pullButtonLabel = pullCooling > 0 ? `绳子收紧中 ${(pullCooling / 1000).toFixed(1)}s` : "拉 TA 一把";

  return (
    <div className="stage brothers-stage">
      <div className="brothers-hud">
        <div className="brothers-progress">
          <div className="brothers-progress-bar">
            <i style={{ width: `${progress * 100}%` }} />
            <b style={{ left: `${progress * 100}%` }} />
          </div>
          <span>
            走了 {Math.round(d.distance / METERS)} 米 · 终点还剩{" "}
            {Math.max(0, Math.round((d.finishX - d.distance) / METERS))} 米
          </span>
        </div>

        <div className="brothers-players">
          <span
            className={"brother-chip me" + (!mine.alive ? " hang" : "") + (mine.finished ? " done" : "")}
            title={myName}
          >
            <i className="dot" style={{ background: myColor }} />
            <b>{myName}</b>
            <em>你</em>
            {!mine.alive && <span className="badge">挂着</span>}
            {mine.finished && <span className="badge">到了</span>}
          </span>
          <span
            className={"brother-chip" + (!mate.alive ? " hang" : "") + (mate.finished ? " done" : "")}
            title={mateName}
          >
            <i className="dot" style={{ background: mateColor }} />
            <b>{mateName}</b>
            <em>TA</em>
            {!mate.alive && <span className="badge">挂着</span>}
            {mate.finished && <span className="badge">到了</span>}
          </span>
        </div>

        <div className="brothers-stats">
          <span title="摔下去的次数">💥 {d.falls}</span>
          <span title="被同伴救回来的次数">🤝 {d.rescued}</span>
          <span title="拉同伴的次数">🪢 {d.pulls}</span>
          <span className={secondsLeft <= 30 ? "urgent" : ""} title="剩余时间">
            ⏱ {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
          </span>
        </div>
      </div>

      <div
        className={"brothers-world" + (canJumpNow ? " can-jump" : "") + (charging ? " charging" : "")}
        ref={worldRef}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture?.(e.pointerId);
          startCharge();
        }}
        onPointerUp={release}
        onPointerCancel={cancelCharge}
        role="button"
        tabIndex={0}
        aria-label={canJumpNow ? "按住蓄力，松开起跳" : mine.alive ? "等冷却结束再跳" : "你挂在绳子上"}
      >
        <div className="brothers-sky" aria-hidden="true">
          <span className="brother-cloud c1" />
          <span className="brother-cloud c2" />
          <span className="brother-hill h1" />
          <span className="brother-hill h2" />
        </div>

        <svg className="brothers-scene" width="100%" height="100%" aria-hidden="true">
          {/* 平台 */}
          {d.platforms.map((p, i) => {
            const px = toX(p.x);
            const pw = p.w * scale;
            const py = toY(p.y);
            if (px + pw < -60 || px > width + 60) return null;
            const isFinish = i === d.platforms.length - 1;
            return (
              <g key={i}>
                <rect
                  x={px}
                  y={py}
                  width={pw}
                  height={Math.max(10, 26 * scale)}
                  rx={6 * scale}
                  fill="#B98A5E"
                  stroke="#3A2618"
                  strokeWidth="2"
                />
                <rect
                  x={px + 2}
                  y={py + 2}
                  width={Math.max(2, pw - 4)}
                  height={Math.max(3, 7 * scale)}
                  rx={3 * scale}
                  fill="#F0D8B6"
                  opacity="0.85"
                />
                {p.spike &&
                  Array.from({ length: Math.max(2, Math.floor(p.w / 22)) }).map((_, k) => {
                    const step = (pw - 12 * scale) / Math.max(1, Math.max(2, Math.floor(p.w / 22)) - 1);
                    const cx = px + 6 * scale + k * step;
                    return (
                      <path
                        key={k}
                        d={`M${cx - 5 * scale} ${py} L${cx} ${py - 12 * scale} L${cx + 5 * scale} ${py} Z`}
                        fill="#E05B5B"
                        stroke="#3A2618"
                        strokeWidth="1.6"
                      />
                    );
                  })}
                {isFinish && (
                  <g transform={`translate(${px + pw - 16 * scale} ${py})`}>
                    <line x1="0" y1="0" x2="0" y2={-40 * scale} stroke="#3A2618" strokeWidth="3" />
                    <path
                      d={`M0 ${-40 * scale} L${22 * scale} ${-33 * scale} L0 ${-26 * scale} Z`}
                      fill="#FF6B6B"
                      stroke="#3A2618"
                      strokeWidth="2"
                    />
                  </g>
                )}
              </g>
            );
          })}

          {/* 落点预览：虚线抛物线 + 落点圈，绿=站得住，红=会掉 */}
          {preview && <LandingPreview preview={preview} d={d} mine={mine} toX={toX} toY={toY} scale={scale} beat={beat} />}

          {/* 绳子 */}
          <path
            d={ropeD}
            fill="none"
            stroke="#FFD36B"
            strokeWidth={ropeW * 2.8}
            strokeLinecap="round"
            opacity={ropeTaut ? 0.28 : 0.14}
            style={ropeTaut ? { filter: "drop-shadow(0 0 6px rgba(255,190,70,0.85))" } : undefined}
          />
          <path
            d={ropeD}
            fill="none"
            stroke={ropeTaut ? "#9C3B2E" : "#7B4A2A"}
            strokeWidth={ropeW}
            strokeLinecap="round"
            strokeDasharray={tension < 0.25 ? `${6 * scale} ${3 * scale}` : undefined}
          />
          {ropeHang && (
            <path
              d={ropeD}
              fill="none"
              stroke="#FFE0A3"
              strokeWidth={Math.max(1, ropeW * 0.42)}
              strokeLinecap="round"
              strokeDasharray={`${2 * scale} ${7 * scale}`}
              opacity="0.9"
            />
          )}
          {/* 绳结 */}
          <circle cx={ax} cy={ay} r={Math.max(2, 3.2 * scale)} fill="#F2D29B" stroke="#3A2618" strokeWidth="1.4" />
          <circle cx={bx} cy={by} r={Math.max(2, 3.2 * scale)} fill="#F2D29B" stroke="#3A2618" strokeWidth="1.4" />
          {/* 绷紧时的小火花 */}
          {ropeTaut &&
            [0, 1, 2].map((k) => {
              const flick = 0.35 + 0.65 * Math.abs(Math.sin(beat / 130 + k * 1.7));
              const ox = Math.sin(beat / 90 + k * 2.1) * 5 * scale;
              const oy = -k * 4 * scale;
              return (
                <circle
                  key={k}
                  cx={midX + ox}
                  cy={midY + oy}
                  r={Math.max(1.1, 1.9 * scale)}
                  fill="#FFE08A"
                  opacity={flick}
                />
              );
            })}

          {/* 猴子 */}
          {[0, 1].map((i) => {
            const v = vis[i];
            const isMe = i === seat;
            const m = d.mon[i];
            return (
              <g key={i}>
                {!v.hang && !v.jumping && (
                  <ellipse
                    cx={toX(m.x)}
                    cy={toY(m.y) + 2}
                    rx={16 * scale}
                    ry={4 * scale}
                    fill="rgba(58,38,24,0.16)"
                  />
                )}
                <MonkeyBody
                  feetX={toX(v.x)}
                  feetY={toY(v.feetWorld)}
                  scale={scale}
                  color={isMe ? myColor : mateColor}
                  pose={v.pose}
                  swing={v.swing}
                  glow={isMe && canJumpNow}
                />
              </g>
            );
          })}

          {/* 名字 / 状态标签 */}
          {[
            { v: myVis, label: myLabel, me: true },
            { v: mateVis, label: mateLabel, me: false },
          ].map((tag, i) => (
            <text
              key={i}
              x={toX(tag.v.x)}
              y={toY(tag.v.feetWorld) - 64 * scale - (tag.v.hang ? 10 * scale : 0)}
              textAnchor="middle"
              fontSize={Math.max(10, 12 * scale + 1)}
              fontWeight={800}
              fill={tag.me ? "#8C2F2F" : "#2F5E8C"}
              stroke="#FFFCF2"
              strokeWidth={Math.max(2.4, 3.2 * scale)}
              paintOrder="stroke"
            >
              {tag.label}
            </text>
          ))}

          {/* 蓄力条：在自己猴子头顶 */}
          {charging && (
            <g
              transform={`translate(${toX(myVis.x)} ${toY(myVis.feetWorld) - 84 * scale})`}
              className="brothers-charge"
            >
              <rect
                x={-34 * scale}
                y={-5 * scale}
                width={68 * scale}
                height={10 * scale}
                rx={5 * scale}
                fill="rgba(58,38,24,0.18)"
                stroke="#3A2618"
                strokeWidth="1.4"
              />
              <rect
                x={-32 * scale}
                y={-3 * scale}
                width={64 * scale * clamp01(chargeHold / tuning.chargeMs)}
                height={6 * scale}
                rx={3 * scale}
                fill={chargeHold / tuning.chargeMs > 0.75 ? "#FF6B6B" : chargeHold / tuning.chargeMs > 0.35 ? "#FFC93C" : "#4CC38A"}
              />
              <text
                x="0"
                y={-11 * scale}
                textAnchor="middle"
                fontSize={Math.max(9, 10.5 * scale + 1)}
                fontWeight={800}
                fill="#3A2618"
                stroke="#FFFCF2"
                strokeWidth="2.6"
                paintOrder="stroke"
              >
                {Math.round((chargeHold / tuning.chargeMs) * 100)}%
              </text>
            </g>
          )}
        </svg>

        <div className={"brothers-status" + (!mine.alive ? " hang" : "")} aria-live={charging ? "off" : "polite"}>
          {status}
        </div>

        {canPull && (
          <button
            type="button"
            className={"brothers-pull" + (pullCooling > 0 ? " cooling" : "")}
            disabled={pullCooling > 0}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (pullCooling > 0) return;
              act({ type: "pull" });
            }}
          >
            <Icon name="hand" size={17} />
            <span>{pullButtonLabel}</span>
            <em>
              绳距 {(pullDistance / METERS).toFixed(1)} / {(d.rope / METERS).toFixed(0)} 米
            </em>
          </button>
        )}
      </div>

      <p className="stage-hint">{stageHint(d, mine, mate)}</p>
    </div>
  );
};

function LandingPreview({
  preview,
  d,
  mine,
  toX,
  toY,
  scale,
  beat,
}: {
  preview: Prediction;
  d: BrothersData;
  mine: Monkey;
  toX: (x: number) => number;
  toY: (y: number) => number;
  scale: number;
  beat: number;
}) {
  const fromX = toX(preview.fromX);
  const fromY = toY(mine.y);
  const onSpike = preview.land?.spike;
  const fallY = onSpike ? preview.land!.y : mine.y - 34;
  const endY = preview.safe ? toY(preview.land!.y) : toY(fallY);
  const endX = toX(preview.to);
  const ctrlX = (fromX + endX) / 2;
  const ctrlY = Math.min(fromY, endY) - (34 + 62 * preview.power) * scale;
  const color = preview.safe ? "#2E9E5B" : "#D84343";
  const pulse = 1 + Math.sin(beat / 150) * 0.12;
  return (
    <g className="brothers-preview">
      <path
        d={`M${fromX} ${fromY} Q ${ctrlX} ${ctrlY} ${endX} ${endY}`}
        fill="none"
        stroke={color}
        strokeWidth={Math.max(1.8, 2.4 * scale)}
        strokeDasharray={`${6 * scale} ${5 * scale}`}
        strokeLinecap="round"
        opacity="0.9"
      />
      <circle
        cx={endX}
        cy={endY}
        r={Math.max(6, 9 * scale) * pulse}
        fill={preview.safe ? "rgba(76,195,138,0.22)" : "rgba(216,67,67,0.2)"}
        stroke={color}
        strokeWidth={Math.max(1.6, 2.2 * scale)}
      />
      <circle cx={endX} cy={endY} r={Math.max(1.5, 2.4 * scale)} fill={color} />
      <text
        x={endX}
        y={endY - 14 * scale}
        textAnchor="middle"
        fontSize={Math.max(9, 10.5 * scale + 1)}
        fontWeight={800}
        fill={color}
        stroke="#FFFCF2"
        strokeWidth="2.6"
        paintOrder="stroke"
      >
        {preview.safe ? `${(preview.dist / METERS).toFixed(1)}m` : "会掉"}
      </text>
      {!preview.safe && (
        <path
          d={`M${endX - 4 * scale} ${endY - 6 * scale} L${endX} ${endY - 1 * scale} L${endX + 4 * scale} ${endY - 6 * scale}`}
          fill="none"
          stroke={color}
          strokeWidth={Math.max(1.4, 2 * scale)}
          strokeLinecap="round"
        />
      )}
      {preview.finished && (
        <text
          x={endX}
          y={endY - 27 * scale}
          textAnchor="middle"
          fontSize={Math.max(9, 10.5 * scale + 1)}
          fontWeight={800}
          fill="#2E9E5B"
          stroke="#FFFCF2"
          strokeWidth="2.6"
          paintOrder="stroke"
        >
          终点！
        </text>
      )}
      {preview.hold >= d.tuning.chargeMs - 2 && (
        <text
          x={endX}
          y={endY - 40 * scale}
          textAnchor="middle"
          fontSize={Math.max(8, 9.5 * scale + 1)}
          fontWeight={800}
          fill="#8C2F2F"
          stroke="#FFFCF2"
          strokeWidth="2.4"
          paintOrder="stroke"
        >
          最远啦
        </text>
      )}
    </g>
  );
}

function stageHint(d: BrothersData, mine: Monkey, mate: Monkey) {
  if (!mine.alive) return "抓住绳子别松手——TA 跳到平台上，或者按「拉 TA 一把」，都能把你拽回来。";
  if (!mate.alive) return "TA 挂在绳子上了，按下面的按钮拉一把；绳距越远，绳子绷得越紧。";
  if (mine.finished) return "你已经到终点啦，等 TA 的时候随时可以拉 TA 一把。";
  if (d.pulls > 0) return `已经互救 ${d.rescued} 次了，保持这个节奏，一起走到终点。`;
  return "轻点是小跳，长按才跳远；蓄力时看绿色的落点圈，变成红色就说明会掉下去。";
}

export const ResultExtra = ({ room, seat, game }: ResultExtraProps) => {
  const d = game.data as BrothersData;
  const meters = Math.round(d.distance / METERS);
  const mine = room.seats[seat]?.profile?.nickname || "你";
  const pulls = Number(d.pulls) || 0;
  return (
    <div className="brothers-result">
      <div className="brothers-result-row">
        <span>
          <b>{meters}</b> 米
        </span>
        <span>
          <b>{d.falls}</b> 次摔倒
        </span>
        <span>
          <b>{d.rescued}</b> 次互救
        </span>
        <span>
          <b>{pulls}</b> 次拉人
        </span>
      </div>
      <p className="muted">
        {d.overReason === "finish"
          ? `${mine} 和 TA 一起走到了终点${pulls > 0 ? `，路上拉了 ${pulls} 把` : ""}，默契值 +1。`
          : d.overReason === "both-fall"
            ? "两个人都掉下去了……下次记得让一个先站稳，再拉另一个。"
            : "时间到的时候还没走完，再来一局试试？"}
      </p>
    </div>
  );
};
