// 爱情飞行棋：游戏界面（文件名 = 游戏 id）。
// 地图是一条沿天空蜿蜒的航线：格子是沿途的小岛 / 云朵站，棋子是两架真正的小飞机。
// 服务端只给最终 pos，这里根据 lastMove.from/to（旧数据退回比较 pos）逐格补间。
// 结算页由 GameStageHost 统一渲染，这里只处理 phase = "roll" / "event"。
import { useEffect, useMemo, useRef, useState } from "react";
import { sfx } from "../lib/sound";
import type { ResultExtraProps, StageProps } from "./types";
import "./love-flight.css";

const INK = "#3A2618";
const VIEW_W = 1000;
const STEP_MS = 225;
const SWAP_MS = 1020;
const CROSS_MS = 880;

const FALLBACK_COLORS = ["#FF6B81", "#4D9DFF"];

const EVENT_META: Record<string, { emoji: string; kicker: string; action: string; delta?: string }> = {
  truth: { emoji: "💬", kicker: "真心话时间", action: "说完了" },
  task: { emoji: "🎯", kicker: "小任务时间", action: "做完啦" },
  forward: { emoji: "⏩", kicker: "顺风一程", action: "继续", delta: "前进 2 格" },
  back: { emoji: "⏪", kicker: "小插曲", action: "继续", delta: "后退 2 格" },
  swap: { emoji: "🔁", kicker: "换个位置", action: "继续", delta: "和 TA 交换飞机" },
  again: { emoji: "🎲", kicker: "再来一次", action: "再掷一次", delta: "这个回合再掷一次" }
};

const CELL_COLORS: Record<string, { fill: string; ring: string; deep: string }> = {
  start: { fill: "#FFF4D6", ring: "#E9B45C", deep: "#C58A32" },
  plain: { fill: "#FFFDF4", ring: "#AFD7EE", deep: "#7FB8D8" },
  truth: { fill: "#E6F5FF", ring: "#77B8E6", deep: "#4D93C4" },
  task: { fill: "#FFEACB", ring: "#F0AB5D", deep: "#C97A2B" },
  forward: { fill: "#E4F8E8", ring: "#75C98A", deep: "#449D5E" },
  back: { fill: "#F0E8FF", ring: "#A98AE0", deep: "#7C5FB4" },
  swap: { fill: "#FFE5F1", ring: "#E98FBB", deep: "#BE5E8B" },
  again: { fill: "#FFF7C9", ring: "#E1C94E", deep: "#B39E2D" },
  finish: { fill: "#FFE0E8", ring: "#E8364F", deep: "#B5263C" }
};

type Pt = { x: number; y: number };
type SeatPair = [number, number];

interface RoutePoint extends Pt {
  dist: number;
  angle: number;
}

interface RouteCell extends Pt {
  dist: number;
  angle: number;
}

interface FlightRoute {
  width: number;
  height: number;
  pathD: string;
  samples: RoutePoint[];
  cells: RouteCell[];
  cellR: number;
  total: number;
  lanes: number;
}

interface PlanePose extends Pt {
  angle: number;
}

interface MotionFrame {
  poses: [PlanePose, PlanePose];
  trails: [Pt[], Pt[]];
}

interface FlightPlan {
  kind: "steps" | "swap" | "cross";
  from: SeatPair;
  to: SeatPair;
  moving: number[];
  duration: number;
}

interface MoveMeta {
  id: number;
  source?: string;
  seat?: number;
  kind?: string;
  from?: number[];
  to?: number[];
  at?: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerpAngle(a: number, b: number, t: number) {
  let delta = ((b - a + 540) % 360) - 180;
  if (delta === -180) delta = 180;
  return a + delta * t;
}

function cubicPoint(p0: Pt, c1: Pt, c2: Pt, p1: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y
  };
}

function toPair(value: unknown, fallback: SeatPair): SeatPair {
  if (!Array.isArray(value) || value.length < 2) return fallback;
  const a = Number(value[0]);
  const b = Number(value[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return fallback;
  return [Math.round(a), Math.round(b)];
}

function asMove(value: unknown): MoveMeta | null {
  if (!value || typeof value !== "object") return null;
  const move = value as Record<string, unknown>;
  if (typeof move.id !== "number") return null;
  return move as unknown as MoveMeta;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([\da-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = Number.parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixColor(hex: string, target: string, amount: number) {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  if (!a || !b) return hex;
  const t = clamp(amount, 0, 1);
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${toHex(lerp(a[0], b[0], t))}${toHex(lerp(a[1], b[1], t))}${toHex(lerp(a[2], b[2], t))}`;
}

function seatColor(room: StageProps["room"], seat: number) {
  const raw = room.seats[seat]?.profile?.color;
  return raw && hexToRgb(raw) ? raw : FALLBACK_COLORS[seat];
}

/** 一条从下往上绕的 S 形航线；长度不同的棋盘会自动选择 3–6 条航道。 */
function buildRoute(length: number, viewH: number): FlightRoute {
  const safeLength = Math.max(2, Math.round(length) || 24);
  const tall = viewH > 790;
  const short = viewH < 540;
  const lanes =
    safeLength <= 18
      ? tall
        ? 4
        : 3
      : safeLength <= 24
        ? short
          ? 3
          : tall
            ? 5
            : 4
        : short
          ? 4
          : tall
            ? 6
            : 5;
  const left = 126;
  const right = VIEW_W - 126;
  const top = 86;
  const bottom = viewH - 86;
  const laneGap = (bottom - top) / Math.max(1, lanes - 1);
  const wave = clamp(laneGap * 0.09, 5, 16);
  const raw: Pt[] = [];
  const push = (x: number, y: number) => {
    const last = raw[raw.length - 1];
    if (!last || Math.hypot(x - last.x, y - last.y) > 0.05) raw.push({ x, y });
  };

  for (let lane = 0; lane < lanes; lane++) {
    const y = bottom - lane * laneGap;
    const even = lane % 2 === 0;
    const x0 = even ? left + (lane % 3) * 9 : right - (lane % 3) * 9;
    const x1 = even ? right - ((lane + 1) % 3) * 10 : left + ((lane + 2) % 3) * 8;
    const steps = 88;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // 首尾保持在航道上，中间轻轻起伏，避免看起来像六列矩形表格。
      const ripple =
        Math.sin(t * Math.PI * 2 + (lane % 2 === 0 ? 0 : Math.PI)) * wave +
        Math.sin(t * Math.PI) * (even ? 5 : -5);
      push(lerp(x0, x1, t), y + ripple);
    }

    if (lane < lanes - 1) {
      const nextY = bottom - (lane + 1) * laneGap;
      const side = even ? 1 : -1;
      const bow = 57;
      const c1 = { x: x1 + side * bow, y: y + (nextY - y) * 0.24 };
      const c2 = { x: x1 + side * bow, y: nextY - (nextY - y) * 0.24 };
      const stepsOut = 72;
      for (let i = 1; i <= stepsOut; i++) {
        const p = cubicPoint({ x: x1, y }, c1, c2, { x: x1, y: nextY }, i / stepsOut);
        push(p.x, p.y);
      }
    }
  }

  const samples: RoutePoint[] = [];
  let total = 0;
  for (let i = 0; i < raw.length; i++) {
    if (i > 0) total += Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y);
    samples.push({ ...raw[i], dist: total, angle: 0 });
  }
  let previousAngle = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = samples[Math.max(0, i - 1)];
    const b = samples[Math.min(samples.length - 1, i + 1)];
    let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    // 让 0° / 180° 在转弯处连续，避免飞机在格子边缘突然翻个身。
    while (angle - previousAngle > 180) angle -= 360;
    while (angle - previousAngle < -180) angle += 360;
    samples[i].angle = angle;
    previousAngle = angle;
  }

  const spacing = total / Math.max(1, safeLength - 1);
  const rawCellR = clamp(spacing * 0.4, 32, 54);
  const cellR = short ? Math.max(24, Math.min(rawCellR, laneGap * 0.42)) : rawCellR;
  const cells: RouteCell[] = Array.from({ length: safeLength }, (_, index) => {
    const distance = (total * index) / Math.max(1, safeLength - 1);
    const point = routeAtDistanceFrom(samples, distance);
    return { x: point.x, y: point.y, dist: distance, angle: point.angle };
  });
  const pathD = raw
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");

  return { width: VIEW_W, height: viewH, pathD, samples, cells, cellR, total, lanes };
}

function routeAtDistanceFrom(samples: RoutePoint[], distance: number): RoutePoint {
  if (samples.length === 0) return { x: VIEW_W / 2, y: 300, dist: 0, angle: 0 };
  const target = clamp(distance, 0, samples[samples.length - 1].dist);
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].dist < target) lo = mid + 1;
    else hi = mid;
  }
  const index = clamp(lo, 1, samples.length - 1);
  const a = samples[index - 1];
  const b = samples[index];
  const span = b.dist - a.dist;
  const t = span > 0.0001 ? (target - a.dist) / span : 0;
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    dist: target,
    angle: lerpAngle(a.angle, b.angle, t)
  };
}

function routeAtDistance(route: FlightRoute, distance: number) {
  return routeAtDistanceFrom(route.samples, distance);
}

function restPose(route: FlightRoute, cell: number, seat: number, otherCell: number): PlanePose {
  const index = clamp(Math.round(cell), 0, route.cells.length - 1);
  const target = route.cells[index] || { x: VIEW_W / 2, y: route.height / 2, angle: 0, dist: 0 };
  const rad = (target.angle * Math.PI) / 180;
  const nx = -Math.sin(rad);
  const ny = Math.cos(rad);
  const offset = otherCell === index ? (seat === 0 ? -1 : 1) * route.cellR * 0.66 : 0;
  return {
    x: target.x + nx * offset,
    y: target.y - route.cellR * 0.2 + ny * offset,
    angle: target.angle
  };
}

function makePlan(from: SeatPair, to: SeatPair, route: FlightRoute, kindHint?: string): FlightPlan | null {
  const valid = (n: number) => Number.isInteger(n) && n >= 0 && n < route.cells.length;
  if (!valid(from[0]) || !valid(from[1]) || !valid(to[0]) || !valid(to[1])) return null;
  const moving = [0, 1].filter((seat) => from[seat] !== to[seat]);
  if (moving.length === 0) return null;

  const swapped =
    moving.length === 2 && to[0] === from[1] && to[1] === from[0];
  if (kindHint === "swap" || swapped) {
    return { kind: "swap", from, to, moving, duration: SWAP_MS };
  }

  if (moving.length === 1) {
    const distance = Math.abs(to[moving[0]] - from[moving[0]]);
    if (distance > 8) return { kind: "cross", from, to, moving, duration: CROSS_MS };
    return { kind: "steps", from, to, moving, duration: Math.max(STEP_MS, distance * STEP_MS) };
  }

  return { kind: "cross", from, to, moving, duration: CROSS_MS };
}

function trackPose(plan: FlightPlan, progress: number, route: FlightRoute, seat: number): PlanePose {
  const p = clamp(progress, 0, 1);
  const fromCell = plan.from[seat];
  const toCell = plan.to[seat];

  if (plan.kind === "steps") {
    const count = Math.abs(toCell - fromCell);
    const direction = Math.sign(toCell - fromCell);
    const time = p * count * STEP_MS;
    const step = Math.min(count - 1, Math.floor(time / STEP_MS));
    const local = count <= 0 ? 0 : clamp((time - step * STEP_MS) / STEP_MS, 0, 1);
    const startCell = fromCell + direction * step;
    const endCell = startCell + direction;
    const eased = easeInOut(local);
    const start = route.cells[startCell];
    const end = route.cells[endCell];
    const point = routeAtDistance(route, lerp(start.dist, end.dist, eased));
    const lift = Math.sin(local * Math.PI) * (route.cellR * 0.55 + 8);
    const noseUp = -Math.cos((point.angle * Math.PI) / 180) * 7 * Math.sin(local * Math.PI);
    return { x: point.x, y: point.y - route.cellR * 0.2 - lift, angle: point.angle + noseUp };
  }

  const a = route.cells[fromCell];
  const b = route.cells[toCell];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length;
  const ny = dx / length;
  const bend = Math.min(190, 64 + length * 0.16) * (seat === 0 ? -1 : 1);
  const control = {
    x: (a.x + b.x) / 2 + nx * bend,
    y: (a.y + b.y) / 2 + ny * bend
  };
  const eased = easeInOut(p);
  const u = 1 - eased;
  const point = {
    x: u * u * a.x + 2 * u * eased * control.x + eased * eased * b.x,
    y: u * u * a.y + 2 * u * eased * control.y + eased * eased * b.y
  };
  const tangent = {
    x: 2 * u * (control.x - a.x) + 2 * eased * (b.x - control.x),
    y: 2 * u * (control.y - a.y) + 2 * eased * (b.y - control.y)
  };
  const angle = (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI;
  const bank = Math.sin(eased * Math.PI) * (seat === 0 ? -10 : 10);
  return { x: point.x, y: point.y, angle: angle + bank };
}

function renderPlan(plan: FlightPlan, progress: number, route: FlightRoute): MotionFrame {
  const p = clamp(progress, 0, 1) >= 1 ? 1 : progress;
  const moving = new Set(plan.moving);
  const poses: [PlanePose, PlanePose] = [
    moving.has(0)
      ? trackPose(plan, p, route, 0)
      : restPose(route, plan.from[0], 0, plan.from[1]),
    moving.has(1)
      ? trackPose(plan, p, route, 1)
      : restPose(route, plan.from[1], 1, plan.from[0])
  ];
  const trails: [Pt[], Pt[]] = [[], []];
  for (const seat of plan.moving) {
    const points: Pt[] = [];
    const sampleCount = 6;
    const span =
      plan.kind === "steps"
        ? Math.min(0.2, 0.42 / Math.max(1, Math.abs(plan.to[seat] - plan.from[seat])))
        : 0.09;
    for (let i = 0; i < sampleCount; i++) {
      const back = (sampleCount - 1 - i) / (sampleCount - 1);
      const tailProgress = p - back * span;
      if (tailProgress <= 0) continue;
      const tail = trackPose(plan, tailProgress, route, seat);
      points.push({ x: tail.x, y: tail.y });
    }
    if (points.length > 1) trails[seat] = points;
  }
  return { poses, trails };
}

/**
 * 客户端动画队列：服务端 pos 永远是真值，这里只负责让图案晚一点追上它。
 * - 新的一局 / 重连 / 第一次挂载：直接落位，不播动画。
 * - 没有 lastMove 的旧存档：比较两次 pos，仍能补间。
 */
function useFlightMotion(
  route: FlightRoute,
  target: SeatPair,
  moveValue: MoveMeta | null,
  gameRun: string
) {
  const initial: SeatPair = [target[0], target[1]];
  const [cells, setCells] = useState<SeatPair>(initial);
  const [frame, setFrame] = useState<MotionFrame | null>(null);
  const [movingSeats, setMovingSeats] = useState<number[]>([]);
  const stateRef = useRef({
    cells: initial,
    target: initial,
    route,
    gameRun,
    seenMove: moveValue?.id ?? 0,
    queue: [] as FlightPlan[],
    active: false,
    raf: 0
  });
  const pumpRef = useRef<() => void>(() => {});

  const snap = (next: SeatPair) => {
    const state = stateRef.current;
    cancelAnimationFrame(state.raf);
    state.raf = 0;
    state.active = false;
    state.queue = [];
    state.cells = next;
    state.target = next;
    setCells(next);
    setFrame(null);
    setMovingSeats([]);
  };

  const finish = (plan: FlightPlan) => {
    const state = stateRef.current;
    state.active = false;
    state.raf = 0;
    state.cells = plan.to;
    setCells(plan.to);
    setFrame(null);
    setMovingSeats([]);
    // 允许同一帧里排队的下一段动作接着起飞。
    queueMicrotask(() => pumpRef.current());
  };

  const startNext = () => {
    const state = stateRef.current;
    if (state.active || state.queue.length === 0) return;
    const plan = state.queue.shift() as FlightPlan;
    state.active = true;
    setMovingSeats(plan.moving);

    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || plan.duration <= 0) {
      finish(plan);
      return;
    }

    const startedAt = performance.now();
    const tick = (now: number) => {
      const live = stateRef.current;
      if (!live.active) return;
      const progress = clamp((now - startedAt) / plan.duration, 0, 1);
      setFrame(renderPlan(plan, progress, live.route));
      if (progress < 1) live.raf = requestAnimationFrame(tick);
      else finish(plan);
    };
    state.raf = requestAnimationFrame(tick);
  };
  pumpRef.current = startNext;

  useEffect(() => {
    const state = stateRef.current;
    const next: SeatPair = [target[0], target[1]];
    const nextMove = moveValue;

    if (state.route !== route) {
      // 旋转屏幕 / 首次拿到真实尺寸时，航线重排，直接落在权威位置。
      state.route = route;
      snap(next);
      if (nextMove) state.seenMove = nextMove.id;
      return;
    }

    if (state.gameRun !== gameRun) {
      state.gameRun = gameRun;
      state.seenMove = nextMove?.id ?? 0;
      snap(next);
      return;
    }

    if (next[0] === state.target[0] && next[1] === state.target[1]) return;
    const previous = state.target;
    state.target = next;

    let from = previous;
    let to = next;
    let kindHint: string | undefined;
    const moveTo = nextMove ? toPair(nextMove.to, [Number.NaN, Number.NaN]) : null;
    const moveFrom = nextMove ? toPair(nextMove.from, [Number.NaN, Number.NaN]) : null;
    const moveMatches = !!nextMove && !!moveTo && !!moveFrom && moveTo[0] === next[0] && moveTo[1] === next[1];

    if (nextMove && nextMove.id > state.seenMove && moveMatches) {
      from = moveFrom as SeatPair;
      to = moveTo as SeatPair;
      kindHint = nextMove.kind;
      state.seenMove = nextMove.id;
    } else if (nextMove && nextMove.id > state.seenMove) {
      // 元数据不可用（例如极端旧数据），退回比较 pos。
      state.seenMove = nextMove.id;
    }

    const plan = makePlan(from, to, route, kindHint);
    if (!plan) {
      snap(next);
      return;
    }
    state.queue.push(plan);
    startNext();
  }, [route, gameRun, target[0], target[1], moveValue?.id]);

  useEffect(
    () => () => {
      const state = stateRef.current;
      cancelAnimationFrame(state.raf);
      state.active = false;
      state.queue = [];
    },
    []
  );

  return { cells, frame, movingSeats };
}

function useBoardViewHeight() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [viewH, setViewH] = useState(840);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 20) return;
      const next = clamp(Math.round((VIEW_W * rect.height) / rect.width), 380, 1600);
      setViewH((old) => (Math.abs(old - next) > 7 ? Math.round(next / 10) * 10 : old));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, viewH };
}

/* ================= 航线上的图标 ================= */

function CellIcon({ kind }: { kind: string }) {
  switch (kind) {
    case "start":
      return (
        <g>
          <path d="M -9 15 L -9 -15" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M -9 -15 L 13 -8 L -9 -1 Z" fill="#E9A33F" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        </g>
      );
    case "finish":
      return (
        <path
          d="M0 16 C-22 2 -17 -13 -6 -10 C-2 -9 0 -6 0 -5 C0 -6 2 -9 6 -10 C17 -13 22 2 0 16 Z"
          fill="#E8364F"
          stroke={INK}
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
      );
    case "truth":
      return (
        <g>
          <path
            d="M -16 -12 Q -16 -18 -10 -18 L 10 -18 Q 16 -18 16 -12 L 16 4 Q 16 10 10 10 L -2 10 L -10 17 L -9 10 L -10 10 Q -16 10 -16 4 Z"
            fill="#FFFFFF"
            stroke={INK}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <circle cx="-7" cy="-4" r="2" fill={CELL_COLORS.truth.deep} />
          <circle cx="0" cy="-4" r="2" fill={CELL_COLORS.truth.deep} />
          <circle cx="7" cy="-4" r="2" fill={CELL_COLORS.truth.deep} />
        </g>
      );
    case "task":
      return (
        <g>
          <circle cx="0" cy="0" r="15" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
          <circle cx="0" cy="0" r="9" fill="none" stroke={CELL_COLORS.task.deep} strokeWidth="3" />
          <circle cx="0" cy="0" r="3.4" fill={CELL_COLORS.task.deep} />
        </g>
      );
    case "forward":
      return (
        <g fill="none" stroke={INK} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M -14 -11 L -3 0 L -14 11" />
          <path d="M 0 -11 L 11 0 L 0 11" />
        </g>
      );
    case "back":
      return (
        <g fill="none" stroke={INK} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 14 -11 L 3 0 L 14 11" />
          <path d="M 0 -11 L -11 0 L 0 11" />
        </g>
      );
    case "swap":
      return (
        <g fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M -14 -7 C -9 -14 7 -14 13 -7" />
          <path d="M 8 -11 L 13 -7 L 8 -2" />
          <path d="M 14 7 C 9 14 -7 14 -13 7" />
          <path d="M -8 11 L -13 7 L -8 2" />
        </g>
      );
    case "again":
      return (
        <g>
          <rect x="-13" y="-13" width="26" height="26" rx="6" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
          <circle cx="-6" cy="-6" r="2.2" fill={INK} />
          <circle cx="0" cy="0" r="2.2" fill={INK} />
          <circle cx="6" cy="6" r="2.2" fill={INK} />
        </g>
      );
    default:
      return (
        <g>
          <path d="M0 -8 L2 -2 L8 0 L2 2 L0 8 L-2 2 L-8 0 L-2 -2 Z" fill={CELL_COLORS.plain.deep} opacity="0.72" />
        </g>
      );
  }
}

function Cloud({ x, y, scale = 1, opacity = 0.9 }: { x: number; y: number; scale?: number; opacity?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={opacity} aria-hidden="true">
      <ellipse cx="0" cy="4" rx="48" ry="17" fill="#FFFFFF" />
      <circle cx="-25" cy="-5" r="21" fill="#FFFFFF" />
      <circle cx="2" cy="-15" r="27" fill="#FFFFFF" />
      <circle cx="32" cy="-2" r="17" fill="#FFFFFF" />
    </g>
  );
}

function MiniHeart({ x, y, size = 1, color = "#F08AA7", opacity = 0.8 }: { x: number; y: number; size?: number; color?: string; opacity?: number }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${size})`}
      d="M0 10 C-13 2 -11 -8 -4 -6 C-1 -5 0 -3 0 -2 C0 -3 1 -5 4 -6 C11 -8 13 2 0 10 Z"
      fill={color}
      opacity={opacity}
      aria-hidden="true"
    />
  );
}

/* ================= 小飞机 ================= */

function PlaneSprite({ color, seat }: { color: string; seat: number }) {
  const dark = mixColor(color, "#2A1B10", 0.28);
  const light = mixColor(color, "#FFFFFF", 0.5);
  const glass = mixColor(color, "#E9FAFF", 0.78);

  return (
    <g className="lf-plane-body">
      {/* 尾翼 */}
      <path
        d="M -35 -4 L -48 -28 L -31 -25 L -23 -6 Z"
        fill={dark}
        stroke={INK}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M -44 0 L -58 -16 L -46 -18 L -31 -4 Z"
        fill={light}
        stroke={INK}
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      {/* 上下机翼 */}
      <path
        d="M 8 0 L -18 -42 L -1 -44 L 31 -8 Z"
        fill={color}
        stroke={INK}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M 8 0 L -18 42 L -1 44 L 31 8 Z"
        fill={dark}
        stroke={INK}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M -2 -12 L -13 -34" stroke={light} strokeWidth="3.6" strokeLinecap="round" opacity="0.9" />
      <path d="M 1 12 L -12 34" stroke={light} strokeWidth="2.4" strokeLinecap="round" opacity="0.5" />
      {/* 机身 */}
      <path
        d="M 53 0 C 51 -8 43 -13 29 -13 L -34 -10 C -44 -8 -49 -4 -49 0 C -49 4 -44 8 -34 10 L 29 13 C 43 13 51 8 53 0 Z"
        fill={color}
        stroke={INK}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M 46 3 C 38 8 28 9 18 8 L -33 5 C -40 4 -45 3 -47 1 C -44 4 -39 6 -32 7 L 18 10 C 31 10 41 8 46 3 Z"
        fill={light}
        opacity="0.82"
      />
      <path d="M -37 -2 L 18 -2" stroke={light} strokeWidth="2.2" strokeLinecap="round" opacity="0.75" />
      {/* 驾驶舱和舷窗 */}
      <path
        d="M 24 -10 C 33 -10 42 -6 46 -1 L 41 -2 C 36 -6 30 -7 24 -6 Z"
        fill={glass}
        stroke={INK}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="13" cy="-4.5" r="3.7" fill={glass} stroke={INK} strokeWidth="1.6" />
      <circle cx="2.5" cy="-5" r="3.1" fill={glass} stroke={INK} strokeWidth="1.5" />
      <circle cx="-6.5" cy="-5.2" r="2.6" fill={glass} stroke={INK} strokeWidth="1.4" />
      {/* 机身上的小爱心 */}
      <path
        d="M -20 0 C -27 -4 -25 -10 -21 -8 C -19 -7 -20 -5 -20 -5 C -20 -5 -19 -7 -17 -8 C -13 -10 -13 -4 -20 0 Z"
        fill={light}
        stroke={INK}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx={-25} cy="7" r="3.4" fill="#FFF8E8" stroke={INK} strokeWidth="1.4" />
      <text x={-25} y={9.2} textAnchor="middle" fontSize="5.2" fontWeight="800" fill={INK}>
        {seat + 1}
      </text>
      {/* 螺旋桨 */}
      <g className="lf-prop">
        <ellipse cx="57" cy="0" rx="2.7" ry="18" fill={dark} opacity="0.72" />
        <ellipse cx="57" cy="0" rx="2.7" ry="18" fill={light} opacity="0.38" transform="rotate(58 57 0)" />
        <circle cx="57" cy="0" r="4.3" fill="#FFF8E8" stroke={INK} strokeWidth="2" />
      </g>
      {/* 尾迹 */}
      <g className="lf-plane-wake" fill="none" stroke={light} strokeWidth="3" strokeLinecap="round">
        <path d="M -60 -10 L -75 -13" />
        <path d="M -58 11 L -71 16" />
      </g>
    </g>
  );
}

function MiniPlane({ color, seat, className = "" }: { color: string; seat: number; className?: string }) {
  return (
    <svg className={"lf-mini-plane " + className} viewBox="-66 -48 132 96" aria-hidden="true">
      <g transform="rotate(-7)">
        <PlaneSprite color={color} seat={seat} />
      </g>
    </svg>
  );
}

interface PlaneTokenProps {
  seat: number;
  color: string;
  label: string;
  cell: number;
  x: number;
  y: number;
  angle: number;
  scale: number;
  isTurn: boolean;
  isMoving: boolean;
  isMe: boolean;
}

function PlaneToken({ seat, color, label, cell, x, y, angle, scale, isTurn, isMoving, isMe }: PlaneTokenProps) {
  const aria = `${label}的飞机，第 ${cell + 1} 格${isMoving ? "，正在航线上飞行" : ""}`;
  return (
    <g
      className={
        "lf-plane" +
        (isTurn ? " is-turn" : "") +
        (isMoving ? " is-moving" : "") +
        (isMe ? " is-me" : "")
      }
      transform={`translate(${x} ${y})`}
      style={{ ["--plane-color" as string]: color }}
      role="img"
      aria-label={aria}
    >
      <ellipse className="lf-plane-shadow" cx="0" cy={22} rx="34" ry="8.5" fill="#3A2618" opacity="0.18" />
      <g className="lf-plane-hover">
        <g transform={`rotate(${angle})`}>
          <g transform={`scale(${scale})`}>
            <PlaneSprite color={color} seat={seat} />
          </g>
        </g>
      </g>
    </g>
  );
}

/* ================= 格子 ================= */

interface StationProps {
  cell: any;
  x: number;
  y: number;
  radius: number;
  visited: boolean;
  last: boolean;
  tokenSeats: number[];
}

function Station({ cell, x, y, radius, visited, last, tokenSeats }: StationProps) {
  const kind = cell.kind || "plain";
  const palette = CELL_COLORS[kind] || CELL_COLORS.plain;
  const disc = radius * (kind === "plain" ? 0.74 : 0.82);
  const isPlain = kind === "plain";
  const island = !isPlain;
  const classes = [
    "lf-station",
    "k-" + kind,
    visited ? "is-visited" : "",
    last ? "is-last" : "",
    tokenSeats.length ? "has-plane" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const label = `第 ${cell.index + 1} 格，${cell.label}${tokenSeats.length ? `，${tokenSeats.map((seat) => (seat === 0 ? "一号" : "二号")).join("、")}飞机在这里` : ""}`;

  return (
    <g className={classes} transform={`translate(${x} ${y})`} role="img" aria-label={label}>
      <ellipse className="lf-station-shadow" cx="0" cy={disc * 0.8} rx={disc * 1.08} ry={disc * 0.27} fill="#557083" opacity="0.18" />
      {island ? (
        <g className="lf-island-bed" aria-hidden="true">
          <ellipse cx="0" cy={disc * 0.72} rx={disc * 1.14} ry={disc * 0.4} fill="#DDB87C" />
          <ellipse cx="0" cy={disc * 0.64} rx={disc * 1.02} ry={disc * 0.29} fill="#F4DFB4" />
          <path
            d={`M ${-disc * 0.86} ${disc * 0.62} q ${-disc * 0.12} ${-disc * 0.18} ${disc * 0.04} ${-disc * 0.22} M ${-disc * 0.78} ${disc * 0.63} q ${disc * 0.08} ${-disc * 0.15} ${disc * 0.2} ${-disc * 0.14} M ${disc * 0.78} ${disc * 0.64} q ${-disc * 0.05} ${-disc * 0.16} ${disc * 0.14} ${-disc * 0.2}`}
            fill="none"
            stroke="#86B886"
            strokeWidth="2.4"
            strokeLinecap="round"
            opacity="0.82"
          />
        </g>
      ) : (
        <g className="lf-cloud-bed" aria-hidden="true" fill="#FFFDF6" opacity="0.94">
          <ellipse cx="0" cy={disc * 0.55} rx={disc * 1.18} ry={disc * 0.3} />
          <circle cx={-disc * 0.66} cy={disc * 0.24} r={disc * 0.34} />
          <circle cx={disc * 0.7} cy={disc * 0.27} r={disc * 0.3} />
        </g>
      )}
      {kind === "finish" && (
        <g className="lf-finish-tower" aria-hidden="true">
          {/* 终点塔立在航线的末端上方，不占用下一格的位置 */}
          <path
            d={`M ${-disc * 0.4} ${-disc * 0.5} L ${-disc * 0.32} ${-disc * 1.36} Q ${-disc * 0.32} ${-disc * 1.5} ${-disc * 0.15} ${-disc * 1.5} L ${disc * 0.15} ${-disc * 1.5} Q ${disc * 0.32} ${-disc * 1.5} ${disc * 0.32} ${-disc * 1.36} L ${disc * 0.4} ${-disc * 0.5} Z`}
            fill="#FFF1DC"
            stroke={INK}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            d={`M ${-disc * 0.46} ${-disc * 1.31} Q 0 ${-disc * 1.48} ${disc * 0.46} ${-disc * 1.31}`}
            fill="#F3B5C4"
            stroke={INK}
            strokeWidth="2"
          />
          <path d={`M ${-disc * 0.38} ${-disc * 0.72} Q 0 ${-disc * 0.94} ${disc * 0.38} ${-disc * 0.72}`} fill="none" stroke="#F3B5C4" strokeWidth="3" strokeLinecap="round" />
          <circle cx="0" cy={-disc * 1.08} r={disc * 0.14} fill="#BDE9FF" stroke={INK} strokeWidth="1.6" />
          <path d={`M 0 ${-disc * 1.3} C ${-disc * 0.18} ${-disc * 1.42} ${-disc * 0.15} ${-disc * 1.58} ${-disc * 0.02} ${-disc * 1.52} C ${disc * 0.03} ${-disc * 1.5} ${disc * 0.04} ${-disc * 1.46} ${disc * 0.04} ${-disc * 1.44}`} fill="none" stroke="#E8364F" strokeWidth="2" strokeLinecap="round" />
          <path d={`M ${-disc * 0.5} ${-disc * 1.5} L ${-disc * 0.42} ${-disc * 1.68} L ${-disc * 0.18} ${-disc * 1.58} L 0 ${-disc * 1.76} L ${disc * 0.18} ${-disc * 1.58} L ${disc * 0.42} ${-disc * 1.68} L ${disc * 0.5} ${-disc * 1.5} Z`} fill="#E8364F" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
        </g>
      )}
      {kind === "start" && (
        <g className="lf-start-flag" aria-hidden="true">
          <path d={`M ${disc * 0.9} ${disc * 0.3} L ${disc * 0.9} ${-disc * 2.15}`} stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <path
            d={`M ${disc * 0.9} ${-disc * 2.15} L ${disc * 2.02} ${-disc * 1.78} L ${disc * 0.9} ${-disc * 1.4} Z`}
            fill="#F3B34F"
            stroke={INK}
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <circle cx={disc * 0.9} cy={-disc * 2.15} r={disc * 0.08} fill="#E8364F" stroke={INK} strokeWidth="1.4" />
        </g>
      )}
      <circle className="lf-station-halo" cx="0" cy="0" r={disc * 1.03} fill="none" stroke={palette.ring} strokeWidth="2" opacity="0.2" />
      <circle className="lf-station-disc" cx="0" cy="0" r={disc} fill={palette.fill} stroke={INK} strokeWidth={kind === "finish" ? 3.2 : 2.6} />
      <circle cx="0" cy="0" r={disc * 0.84} fill="none" stroke={palette.ring} strokeWidth="2" opacity="0.82" />
      <g transform={`scale(${disc / 33})`}>
        <CellIcon kind={kind} />
      </g>
      {kind !== "plain" && (
        <text
          className="lf-cell-name"
          x={kind === "finish" ? disc * (x > VIEW_W / 2 ? -1.65 : 1.65) : 0}
          y={kind === "finish" ? 4 : disc + 15}
          textAnchor="middle"
          fontSize="11.5"
          fontWeight="800"
          fill={palette.deep}
        >
          {cell.label}
        </text>
      )}
      <text className="lf-cell-num" x={-disc * 0.72} y={-disc * 0.62} textAnchor="middle" fontSize="9.5" fontWeight="800" fill={INK} opacity="0.4">
        {cell.index + 1}
      </text>
    </g>
  );
}

/* ================= 骰子 ================= */

const PIPS: Record<number, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [[30, 30], [70, 70]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[30, 30], [70, 30], [30, 70], [70, 70]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[30, 26], [30, 50], [30, 74], [70, 26], [70, 50], [70, 74]]
};

function DieFace({ value }: { value: number | null }) {
  if (!value || value < 1 || value > 6) {
    return <span className="lf-die-empty" aria-hidden="true">🎲</span>;
  }
  return (
    <svg className="lf-die-svg" viewBox="0 0 100 100" aria-hidden="true">
      {PIPS[value].map(([x, y], index) => (
        <circle key={index} cx={x} cy={y} r="9" fill={INK} />
      ))}
    </svg>
  );
}

/* ================= 游戏界面 ================= */

export function LoveFlightStage({ room, seat, game, act, meta }: StageProps) {
  const d = game.data;
  const opponent = seat === 0 ? 1 : 0;
  const taName = room.seats[opponent]?.profile?.nickname || "TA";
  const myTurn = d.turn === seat;
  const canRoll = d.phase === "roll" && myTurn;
  const { ref: boardRef, viewH } = useBoardViewHeight();
  const route = useMemo(() => buildRoute(Number(d.length) || 24, viewH), [d.length, viewH]);
  const safePos = toPair(d.pos, [0, 0]);
  const move = asMove(d.lastMove);
  const motion = useFlightMotion(route, safePos, move, game.run);
  const color0 = seatColor(room, 0);
  const color1 = seatColor(room, 1);
  const colors = [color0, color1];
  const names = [
    room.seats[0]?.profile?.nickname || "你",
    room.seats[1]?.profile?.nickname || "TA"
  ];
  const busy = !!motion.frame || motion.cells[0] !== safePos[0] || motion.cells[1] !== safePos[1];
  const moving = new Set(motion.movingSeats);
  const activeSeat = motion.movingSeats.length ? motion.movingSeats[0] : d.turn;

  const visited = useMemo(() => {
    const set = new Set<number>();
    for (const entry of d.history || []) {
      if (typeof entry?.from === "number") set.add(entry.from);
      if (typeof entry?.to === "number") set.add(entry.to);
    }
    if (move?.from) for (const n of move.from) if (typeof n === "number") set.add(n);
    if (move?.to) for (const n of move.to) if (typeof n === "number") set.add(n);
    return set;
  }, [d.history, move?.id]);

  const lastCells = useMemo(() => {
    const set = new Set<number>();
    if (move?.to) for (const n of move.to) if (typeof n === "number") set.add(n);
    return set;
  }, [move?.id]);

  const event = d.phase === "event" ? d.event : null;
  const eventMeta = event ? EVENT_META[event.kind] : null;
  // 事件层等飞机落地后再出现，避免刚掷完骰就被卡片盖住航线。
  const showEvent = !!event && !!eventMeta && !busy;

  const turnText = busy
    ? `${names[motion.movingSeats[0] ?? d.turn]} 的飞机正在航线上…`
    : d.phase === "event"
      ? myTurn
        ? "这张卡是你的，处理完就轮到 TA"
        : `等 ${taName} 处理完这张卡`
      : myTurn
        ? "轮到你啦，掷骰子起飞吧"
        : `等 ${taName} 掷骰子`;

  const planePoses: [PlanePose, PlanePose] = motion.frame
    ? motion.frame.poses
    : [
        restPose(route, motion.cells[0], 0, motion.cells[1]),
        restPose(route, motion.cells[1], 1, motion.cells[0])
      ];
  const scale = clamp(route.cellR / 56, 0.78, 0.98);
  const routeArrows = useMemo(() => {
    const marks: Array<{ x: number; y: number; angle: number }> = [];
    for (const fraction of [0.12, 0.3, 0.5, 0.7, 0.88]) {
      const point = routeAtDistance(route, route.total * fraction);
      marks.push({ x: point.x, y: point.y, angle: point.angle });
    }
    return marks;
  }, [route]);

  return (
    <section className="stage love-flight-stage">
      <div className="stage-topline lf-topline">
        <span className="game-eyebrow">{meta.name}</span>
        <span className="round-chip">
          第 {d.round} 轮 · 航线 {d.length} 格
        </span>
      </div>

      <div className="lf-players">
        {[0, 1].map((n) => {
          const profile = room.seats[n]?.profile;
          const isTurn = d.turn === n && d.phase !== "over";
          const isFlying = moving.has(n);
          const shownCell = clamp(motion.cells[n], 0, route.cells.length - 1);
          return (
            <div
              key={n}
              className={
                "lf-player" +
                (isTurn ? " is-turn" : "") +
                (isFlying ? " is-flying" : "") +
                (n === seat ? " me" : "")
              }
              style={{ ["--seat-color" as string]: colors[n] }}
            >
              <MiniPlane color={colors[n]} seat={n} />
              <div className="lf-player-info">
                <b>{profile?.nickname || (n === seat ? "你" : "TA")}</b>
                <span>
                  第 {shownCell + 1} / {d.length} 格 · {d.wins?.[n] ?? 0} 胜
                </span>
              </div>
              {(isFlying || isTurn) && (
                <span className="lf-turn-badge">
                  {isFlying ? "飞行中" : d.phase === "event" ? "看卡" : "该你了"}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="lf-turn" aria-live="polite">
        <span className="lf-turn-dot" aria-hidden="true" />
        {turnText}
      </p>

      <div className="lf-board-wrap" ref={boardRef}>
        <svg
          className="lf-map"
          viewBox={`0 0 ${VIEW_W} ${route.height}`}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label={`爱情飞行棋航线，共 ${d.length} 格。${names[0]} 在第 ${safePos[0] + 1} 格，${names[1]} 在第 ${safePos[1] + 1} 格。`}
        >
          <defs>
            <linearGradient id="lf-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#BDE9FF" />
              <stop offset="0.52" stopColor="#E5F5FF" />
              <stop offset="1" stopColor="#FFE8ED" />
            </linearGradient>
            <radialGradient id="lf-sun" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#FFF9CC" stopOpacity="1" />
              <stop offset="0.72" stopColor="#FFE89C" stopOpacity="0.8" />
              <stop offset="1" stopColor="#FFE89C" stopOpacity="0" />
            </radialGradient>
          </defs>

          <rect x="0" y="0" width={VIEW_W} height={route.height} fill="url(#lf-sky)" />
          <g aria-hidden="true">
            <circle cx="874" cy="86" r="94" fill="url(#lf-sun)" />
            <circle cx="874" cy="86" r="41" fill="#FFF6C4" opacity="0.78" />
            <Cloud x={150} y={110} scale={0.9} opacity={0.86} />
            <Cloud x={714} y={235} scale={0.7} opacity={0.78} />
            <Cloud x={230} y={route.height * 0.58} scale={0.58} opacity={0.7} />
            <Cloud x={790} y={route.height * 0.78} scale={0.78} opacity={0.76} />
            <Cloud x={470} y={route.height - 90} scale={0.5} opacity={0.62} />
            <MiniHeart x={95} y={route.height * 0.34} size={1.15} color="#F29DB5" opacity={0.55} />
            <MiniHeart x={910} y={route.height * 0.48} size={0.9} color="#F6B6C8" opacity={0.7} />
            <MiniHeart x={370} y={135} size={0.7} color="#F6B6C8" opacity={0.55} />
            <g transform={`translate(${route.width - 128} ${route.height - 100})`} opacity="0.55">
              <ellipse cx="0" cy="20" rx="54" ry="15" fill="#E9C89A" />
              <ellipse cx="0" cy="16" rx="43" ry="12" fill="#F5E3BF" />
              <MiniHeart x={0} y={-7} size={1.25} color="#EF8EAA" opacity={0.9} />
            </g>
            <g transform={`translate(116 ${route.height * 0.57})`} opacity="0.4">
              <ellipse cx="0" cy="15" rx="38" ry="10" fill="#E9C89A" />
              <ellipse cx="0" cy="12" rx="29" ry="8" fill="#F5E3BF" />
              <path d="M 0 8 L 0 -16" stroke="#9A7045" strokeWidth="2.2" />
              <path d="M 0 -16 C -17 -22 -18 -5 0 2 C 18 -5 17 -22 0 -16 Z" fill="#8CCB92" opacity="0.8" />
            </g>
          </g>

          <path className="lf-route-sand" d={route.pathD} fill="none" stroke="#FFF7E3" strokeWidth="27" strokeLinecap="round" strokeLinejoin="round" opacity="0.78" />
          <path className="lf-route-shadow" d={route.pathD} fill="none" stroke="#4A7087" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" opacity="0.1" />
          <path
            className="lf-route-dash"
            d={route.pathD}
            fill="none"
            stroke="#EBA85B"
            strokeWidth="4.2"
            strokeLinecap="round"
            strokeDasharray="3 15"
            opacity="0.92"
          />

          <g className="lf-route-arrows" aria-hidden="true" fill="none" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9">
            {routeArrows.map((mark, index) => (
              <path
                key={index}
                d="M -7 -5 L 4 0 L -7 5"
                transform={`translate(${mark.x} ${mark.y}) rotate(${mark.angle})`}
              />
            ))}
          </g>

          {[0, 1].map((n) => {
            const progress = route.cells[clamp(motion.cells[n], 0, route.cells.length - 1)]?.dist ?? 0;
            return <path key={"progress-" + n} className="lf-progress" d={pathUntil(route, progress)} fill="none" stroke={colors[n]} strokeWidth="7" strokeLinecap="round" opacity="0.22" />;
          })}

          {d.board.map((cell: any) => {
            const point = route.cells[cell.index] || { x: VIEW_W / 2, y: route.height / 2 };
            const seatHere = [0, 1].filter((n) => motion.cells[n] === cell.index);
            return (
              <Station
                key={cell.index}
                cell={cell}
                x={point.x}
                y={point.y}
                radius={route.cellR}
                visited={visited.has(cell.index)}
                last={lastCells.has(cell.index)}
                tokenSeats={seatHere}
              />
            );
          })}

          {(motion.frame?.trails || [[], []])[0].length > 1 && (
            <path className="lf-trail" d={polyline((motion.frame?.trails || [[], []])[0])} fill="none" stroke={color0} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" opacity="0.26" />
          )}
          {(motion.frame?.trails || [[], []])[1].length > 1 && (
            <path className="lf-trail" d={polyline((motion.frame?.trails || [[], []])[1])} fill="none" stroke={color1} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" opacity="0.26" />
          )}

          {[0, 1]
            .slice()
            .sort((a, b) => (a === activeSeat ? 1 : 0) - (b === activeSeat ? 1 : 0))
            .map((n) => (
              <PlaneToken
                key={n}
                seat={n}
                color={colors[n]}
                label={names[n]}
                cell={clamp(motion.cells[n], 0, route.cells.length - 1)}
                x={planePoses[n].x}
                y={planePoses[n].y}
                angle={planePoses[n].angle}
                scale={scale}
                isTurn={activeSeat === n && d.phase !== "over"}
                isMoving={moving.has(n)}
                isMe={n === seat}
              />
            ))}
        </svg>
        <div className={"lf-map-status" + (busy ? " is-flying" : "")} aria-hidden="true">
          {busy ? "✈️ 飞行中" : d.phase === "event" ? "💌 降落，请看卡片" : myTurn ? "🧭 轮到你" : "☁️ 等 TA"}
        </div>
      </div>

      <div className="lf-controls">
        <div className={"lf-die" + (d.dice ? " is-rolled" : "")} key={"die-" + (move?.id ?? d.history?.length ?? 0)}>
          <DieFace value={Number(d.dice) || null} />
          <span className="lf-die-caption">
            {d.dice ? `第 ${Math.max(1, (d.rolls?.[0] ?? 0) + (d.rolls?.[1] ?? 0))} 掷` : "待掷"}
          </span>
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
            {canRoll ? (busy ? "继续掷骰子" : "掷骰子，起飞") : d.phase === "event" ? "先处理卡片" : "等 TA 掷骰子"}
          </button>
          <p className="stage-hint lf-hint">掷到几走几格 · 踩到事件卡处理完才换人 · 先到终点赢</p>
        </div>
      </div>

      {showEvent && event && eventMeta && (
        <div className="lf-event-layer">
          <article className={"lf-event-card k-" + event.kind} role="dialog" aria-modal="true" aria-label={eventMeta.kicker}>
            <span className="lf-event-stamp">LOVE POST</span>
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

function polyline(points: Pt[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function pathUntil(route: FlightRoute, distance: number) {
  if (distance <= 0.5) return "";
  const points = route.samples.filter((point) => point.dist <= distance);
  const end = routeAtDistance(route, distance);
  if (points.length === 0) return `M${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
  return (
    points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ") +
    ` L${end.x.toFixed(1)} ${end.y.toFixed(1)}`
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
          <span>格航线</span>
        </div>
      </div>

      {winner !== null && (
        <p className="result-note lf-result-winner">{nameOf(winner)} 先到终点，赢下了这一局。</p>
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
