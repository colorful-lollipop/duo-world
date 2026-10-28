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

interface JumpFx {
  seat: number;
  from: number;
  to: number;
  fromY: number;
  toY: number;
  startedAt: number;
  ms: number;
}

interface Monkey {
  x: number;
  y: number;
  alive: boolean;
}

interface BrothersData {
  platforms: Platform[];
  finishX: number;
  baseY: number;
  rope: number;
  mon: Monkey[];
  turn: number;
  phase: string;
  overReason: string;
  lastJump: JumpFx | null;
  falls: number;
  rescued: number;
  jumps: number;
  distance: number;
  deadline: number;
  startedAt: number;
  count: number;
  spikes: boolean;
}

const CHARGE_MS = 1300;
const VIEW_H = 400;
/** 世界坐标 → 「米」：一格平台大约 30px，看着更像真的走了几百米 */
const METERS = 30;

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

function MonkeyBody({
  feetX,
  feetY,
  scale,
  color,
  pose,
  glow,
}: {
  feetX: number;
  feetY: number;
  scale: number;
  color: string;
  pose: "idle" | "jump" | "hang";
  glow: boolean;
}) {
  const ink = "#3A2618";
  const fur = "#A9744F";
  const furDark = "#8B5E3C";
  const face = "#F6E3C5";
  const swing = pose === "hang" ? -18 : 0;
  return (
    <g transform={`translate(${feetX} ${feetY}) scale(${scale}) rotate(${swing})`}>
      {glow && <ellipse cx="0" cy="-24" rx="30" ry="34" fill={color} opacity="0.16" />}
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
      <path
        d={pose === "jump" ? "M-8 -34 L-16 -46 M8 -34 L16 -46" : "M-10 -14 L-13 -3 M10 -14 L13 -3"}
        stroke={ink}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
}

export const Stage = ({ room, seat, game, act, now }: StageProps) => {
  const d = game.data as BrothersData;
  const beat = useBeat();
  const { ref: worldRef, size } = useSize<HTMLDivElement>();
  const [chargeStart, setChargeStart] = useState<number | null>(null);

  const mine = d.mon[seat];
  const mate = d.mon[1 - seat];
  const myTurn = d.turn === seat && d.phase === "playing";
  const canJump = myTurn && mine?.alive;

  const width = size.w || 720;
  const height = size.h || 320;
  const viewW = width < 560 ? 470 : 860;
  const scale = Math.max(0.4, Math.min(1.6, Math.min(width / viewW, height / VIEW_H)));

  const groundY = height - Math.max(22, height * 0.14);
  const sx = useCallback((x: number) => x * scale, [scale]);
  // 镜头：主要跟着前面那只，但一定要把落在后面（或挂在绳子上）的那只留在画面里
  const x0 = d.mon[0]?.x || 0;
  const x1 = d.mon[1]?.x || 0;
  const lead = Math.max(x0, x1);
  const behind = Math.min(x0, x1);
  const camera = Math.max(-16, Math.min(lead - viewW * 0.55, behind - 56));
  const toX = useCallback((x: number) => (x - camera) * scale, [camera, scale]);
  const toY = useCallback((y: number) => groundY - (d.baseY + y) * scale, [d.baseY, groundY, scale]);

  const serverNow = now();

  const pos = useMemo(() => {
    const out: { x: number; feetY: number | null; alive: boolean; jumping: boolean }[] = [];
    for (let i = 0; i < 2; i++) {
      const m = d.mon[i];
      const j = d.lastJump;
      if (j && j.seat === i && m.alive) {
        const p = Math.min(1, (serverNow - j.startedAt) / j.ms);
        if (p < 1) {
          const x = j.from + (j.to - j.from) * p;
          const y = j.fromY + (j.toY - j.fromY) * p + Math.sin(Math.PI * p) * 78;
          out.push({ x, feetY: y, alive: true, jumping: true });
          continue;
        }
      }
      out.push({ x: m.x, feetY: m.alive ? m.y : null, alive: m.alive, jumping: false });
    }
    return out;
  }, [d.mon, d.lastJump, serverNow]);

  const hangSway = Math.sin(beat / 190) * 7;
  const chargePower = chargeStart ? Math.max(0, Math.min(1, (beat - chargeStart) / CHARGE_MS)) : 0;
  const progress = Math.max(0, Math.min(1, d.distance / Math.max(1, d.finishX)));
  const secondsLeft = Math.max(0, Math.round((d.deadline - serverNow) / 1000));

  const startCharge = useCallback(() => {
    if (!canJump) return;
    setChargeStart(Date.now());
  }, [canJump]);

  const release = useCallback(() => {
    setChargeStart((started) => {
      if (started === null) return null;
      const hold = Math.min(CHARGE_MS, Math.max(0, Date.now() - started));
      act({ type: "jump", hold });
      return null;
    });
  }, [act]);

  useEffect(() => {
    if (!canJump) setChargeStart(null);
  }, [canJump]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      if (!e.repeat) startCharge();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
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

  const myPos = pos[seat] || { x: mine?.x || 0, feetY: null, alive: false, jumping: false };
  const matePos = pos[1 - seat] || { x: mate?.x || 0, feetY: null, alive: false, jumping: false };

  const myFeet = myPos.feetY === null ? Math.min(height - 10, groundY + 54) + hangSway : toY(myPos.feetY);
  const mateFeet = matePos.feetY === null ? Math.min(height - 10, groundY + 54) - hangSway : toY(matePos.feetY);
  const myX = toX(myPos.x);
  const mateX = toX(matePos.x);

  return (
    <div className="stage brothers-stage">
      <div className="brothers-hud">
        <div className="brothers-progress">
          <div className="brothers-progress-bar">
            <i style={{ width: `${progress * 100}%` }} />
            <b style={{ left: `${progress * 100}%` }} />
          </div>
          <span>
            走了 {Math.round(d.distance / METERS)} 米 · 终点还剩 {Math.max(0, Math.round((d.finishX - d.distance) / METERS))} 米
          </span>
        </div>
        <div className="brothers-stats">
          <span title="掉下去的次数">💥 {d.falls}</span>
          <span title="被拉上来的次数">🤝 {d.rescued}</span>
          <span className={secondsLeft <= 30 ? "urgent" : ""} title="剩余时间">
            ⏱ {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
          </span>
        </div>
      </div>

      <div
        className={"brothers-world " + (canJump ? "can-jump" : "")}
        ref={worldRef}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture?.(e.pointerId);
          startCharge();
        }}
        onPointerUp={release}
        onPointerCancel={release}
        role="button"
        tabIndex={0}
        aria-label={canJump ? "按住蓄力，松开起跳" : "等对方跳"}
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
                <rect x={px} y={py} width={pw} height={Math.max(10, 26 * scale)} rx={6 * scale} fill="#B98A5E" stroke="#3A2618" strokeWidth="2" />
                <rect x={px + 2} y={py + 2} width={Math.max(2, pw - 4)} height={Math.max(3, 7 * scale)} rx={3 * scale} fill="#F0D8B6" opacity="0.85" />
                {p.spike &&
                  Array.from({ length: Math.max(2, Math.floor(p.w / 26)) }).map((_, k) => {
                    const cx = px + k * 26 * scale + 13 * scale;
                    return (
                      <path
                        key={k}
                        d={`M${cx - 6 * scale} ${py} L${cx} ${py - 12 * scale} L${cx + 6 * scale} ${py} Z`}
                        fill="#E05B5B"
                        stroke="#3A2618"
                        strokeWidth="1.6"
                      />
                    );
                  })}
                {isFinish && (
                  <g transform={`translate(${px + pw - 16 * scale} ${py})`}>
                    <line x1="0" y1="0" x2="0" y2={-40 * scale} stroke="#3A2618" strokeWidth="3" />
                    <path d={`M0 ${-40 * scale} L${22 * scale} ${-33 * scale} L0 ${-26 * scale} Z`} fill="#FF6B6B" stroke="#3A2618" strokeWidth="2" />
                  </g>
                )}
              </g>
            );
          })}

          {/* 绳子 */}
          <path
            d={`M${myX} ${myFeet - 30 * scale} Q ${(myX + mateX) / 2} ${Math.min(myFeet, mateFeet) - 42 * scale + Math.abs(myX - mateX) * 0.06} ${mateX} ${mateFeet - 30 * scale}`}
            fill="none"
            stroke="#8B5E3C"
            strokeWidth={Math.max(2, 3.4 * scale)}
            strokeLinecap="round"
            strokeDasharray={`${7 * scale} ${3.5 * scale}`}
            opacity="0.95"
          />

          {/* 猴子 */}
          <MonkeyBody
            feetX={myX}
            feetY={myFeet}
            scale={scale}
            color={room.seats[seat]?.profile?.color || "#FF6B6B"}
            pose={!myPos.alive ? "hang" : myPos.jumping ? "jump" : "idle"}
            glow={myTurn}
          />
          <MonkeyBody
            feetX={mateX}
            feetY={mateFeet}
            scale={scale}
            color={room.seats[1 - seat]?.profile?.color || "#4D9DFF"}
            pose={!matePos.alive ? "hang" : matePos.jumping ? "jump" : "idle"}
            glow={!myTurn}
          />

          {/* 轮到谁：头顶箭头 */}
          {[
            { x: myX, y: myFeet, active: myTurn, name: "你" },
            { x: mateX, y: mateFeet, active: !myTurn, name: "TA" },
          ].map((tag, i) => (
            <g key={i} transform={`translate(${tag.x} ${tag.y - 66 * scale + (tag.active ? Math.sin(beat / 200) * 3 : 0)})`} opacity={tag.active ? 1 : 0.45}>
              <path
                d={`M0 ${12 * scale} L${-8 * scale} 0 L${8 * scale} 0 Z`}
                fill={tag.active ? "#FFC93C" : "#CFC2B4"}
                stroke="#3A2618"
                strokeWidth="1.8"
              />
              <text x="0" y={-6 * scale} textAnchor="middle" fontSize={11 * scale + 2} fontWeight="800" fill="#3A2618">
                {tag.name}
              </text>
            </g>
          ))}

          {/* 蓄力条 */}
          {chargeStart !== null && (
            <g transform={`translate(${myX} ${myFeet - 92 * scale})`}>
              <rect x={-26 * scale} y={0} width={52 * scale} height={8 * scale} rx={4 * scale} fill="rgba(58,38,24,0.2)" stroke="#3A2618" strokeWidth="1.4" />
              <rect x={-26 * scale} y={0} width={52 * scale * chargePower} height={8 * scale} rx={4 * scale} fill={chargePower > 0.86 ? "#E05B5B" : "#FFC93C"} />
            </g>
          )}
        </svg>

        <div className={"brothers-turn " + (myTurn ? "mine" : "theirs")} aria-live="polite">
          {d.phase === "playing" ? (
            canJump ? (
              <>
                <Icon name="play" size={15} /> 轮到你跳了 · 按住蓄力，松开起跳
              </>
            ) : myTurn ? (
              <>
                <span className="spinner tiny" /> 你挂在绳子上，等 TA 拉你上来
              </>
            ) : (
              <>等 TA 跳这一下…</>
            )
          ) : (
            <>这一局结束啦</>
          )}
        </div>
      </div>

      <p className="stage-hint">
        {holdHint(d.falls, d.rescued)}
      </p>
    </div>
  );
};

function holdHint(falls: number, rescued: number) {
  if (falls === 0 && rescued === 0) return "轻点是小跳，长按是大跳；掉下去别慌，兄弟还站得住就能救你。";
  if (rescued > 0 && falls > rescued) return `已经摔了 ${falls} 次，被拉上来 ${rescued} 次——稳住节奏，别一起掉下去。`;
  return "一个人掉下去只是挂在绳子上，两个人都掉下去才真的结束。";
}

export const ResultExtra = ({ room, seat, game }: ResultExtraProps) => {
  const d = game.data as BrothersData;
  const meters = Math.round(d.distance / METERS);
  const mine = room.seats[seat]?.profile?.nickname || "你";
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
      </div>
      <p className="muted">
        {d.overReason === "finish"
          ? `${mine} 和 TA 一起走到了终点，默契值 +1。`
          : d.overReason === "both-fall"
            ? "两个人都掉下去了……下次记得先让一个站稳再跳。"
            : "时间到的时候还没走完，再来一局试试？"}
      </p>
    </div>
  );
};
