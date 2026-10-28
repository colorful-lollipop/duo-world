// 哥俩好（双人协作版）
// 两只猴子用一根绳子拴在一起，轮流蓄力跳向前方的平台。
// 跳空了会挂在绳子上，只要同伴跳成功一次就能把他拉上来；两个人都掉下去才算输。
// 规则全部在服务端：客户端只发 { type: "jump", hold }，服务端算出落点。
import { clampInt } from "./_kit.mjs";

const BASE_Y = 84; // 平台基准高度（世界坐标，向上为正）
const ROPE = 260; // 绳长：掉下去的人被拖在同伴这根绳子的范围里
const JUMP_MIN = 82;
const JUMP_MAX = 272;
const CHARGE_MS = 1300; // 长按满蓄力的时长
const JUMP_MS = 560; // 客户端补间时长
const START_X = 62;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 生成一条从左到右的断桥：x 是左边缘，y 是相对基准的高度，spike 是尖刺陷阱。 */
export function makeLevel(seed, count, spikes) {
  const rng = mulberry32(seed);
  const platforms = [{ x: 0, w: 230, y: 0, spike: false }];
  let x = 0;
  let y = 0;
  let prevW = 230;
  for (let i = 1; i < count; i++) {
    const gap = 52 + Math.round(rng() * (28 + Math.min(110, i * 3)));
    const w = 92 + Math.round(rng() * (58 + Math.min(80, i)));
    y = clampInt(y + (rng() - 0.5) * 46, -70, 70, 0);
    x += prevW + gap;
    platforms.push({ x, w, y, spike: !!spikes && i >= 4 && rng() < 0.14 });
    prevW = w;
  }
  const last = platforms[platforms.length - 1];
  const finishX = last.x + last.w - 24;
  return { platforms, finishX };
}

export function platformAt(platforms, x) {
  for (const p of platforms) {
    if (x >= p.x && x <= p.x + p.w) return p;
  }
  return null;
}

function fmtTime(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
}

function endGame(d, reason, now) {
  d.phase = "over";
  d.overReason = reason;
  d.endedAt = now;
  d.lastJump = null;
}

export default {
  create(room) {
    const s = room.settings.brothers || {};
    const count = clampInt(s.platforms, 12, 60, 30);
    const minutes = clampInt(s.time, 2, 15, 5);
    const now = Date.now();
    const seed = Math.floor(Math.random() * 0xffffffff);
    const { platforms, finishX } = makeLevel(seed, count, s.spikes !== "off");
    return {
      seed,
      count,
      spikes: s.spikes !== "off",
      platforms,
      finishX,
      baseY: BASE_Y,
      rope: ROPE,
      mon: [
        { x: START_X, y: 0, alive: true },
        { x: START_X + 30, y: 0, alive: true },
      ],
      turn: 0,
      phase: "playing",
      overReason: "",
      startedAt: now,
      endedAt: 0,
      deadline: now + minutes * 60 * 1000,
      timeLimit: minutes * 60 * 1000,
      lastJump: null,
      falls: 0,
      rescued: 0,
      jumps: 0,
      distance: START_X + 30,
    };
  },

  action(room, seat, action, now) {
    const d = room.game.data;
    if (d.phase !== "playing") return "这一局已经结束啦";
    if (action?.type !== "jump") return "这个操作暂时不可以";
    if (d.turn !== seat) return "轮到 TA 跳啦";
    const me = d.mon[seat];
    if (!me.alive) return "你挂在绳子上，等 TA 把你拉上来";
    const hold = Number(action.hold);
    if (!Number.isFinite(hold) || hold < 0) return "这一跳不太对";
    const power = Math.min(1, hold / CHARGE_MS);
    const dist = Math.round(JUMP_MIN + (JUMP_MAX - JUMP_MIN) * power);
    const from = me.x;
    let to = Math.min(from + dist, d.finishX + 40);
    let land = platformAt(d.platforms, to);
    if (!land && to >= d.finishX) {
      // 跳过头也算到达终点，别把冲线判成掉坑
      to = d.finishX;
      land = d.platforms[d.platforms.length - 1];
    }
    const fromP = platformAt(d.platforms, from);
    const other = 1 - seat;
    const mate = d.mon[other];

    d.jumps++;
    d.lastJump = {
      seat,
      from,
      to,
      fromY: fromP ? fromP.y : me.y,
      toY: land && !land.spike ? land.y : me.y,
      startedAt: now,
      ms: JUMP_MS,
    };

    if (land && !land.spike) {
      me.x = to;
      me.y = land.y;
      me.alive = true;
      d.distance = Math.max(d.distance, to);
      if (!mate.alive) {
        // 把挂着的兄弟拉上来，落在同一块平台上
        mate.x = clampInt(to - 46, land.x + 20, land.x + land.w - 20, land.x + 20);
        mate.y = land.y;
        mate.alive = true;
        d.rescued++;
        d.distance = Math.max(d.distance, mate.x);
      }
      d.turn = other;
      if (to >= d.finishX) endGame(d, "finish", now);
      return null;
    }

    // 跳空了：挂到绳子上，被同伴的绳子拖着走
    me.x = to;
    me.alive = false;
    d.falls++;
    if (!mate.alive) {
      endGame(d, "both-fall", now);
      return null;
    }
    me.x = clampInt(to, mate.x - d.rope, mate.x + d.rope, to);
    d.turn = other;
    return null;
  },

  tick(room, now) {
    const d = room.game?.data;
    if (!d || d.phase !== "playing") return false;
    if (d.deadline > 0 && now >= d.deadline) {
      endGame(d, "time", now);
      return true;
    }
    return false;
  },

  summary(room) {
    const d = room.game.data;
    const spent = fmtTime((d.endedAt || Date.now()) - d.startedAt);
    const meters = Math.max(1, Math.round(d.distance / 30));
    const detail =
      d.overReason === "finish"
        ? `一起走到终点啦！用了 ${spent}，走了 ${meters} 米，摔了 ${d.falls} 次、被救 ${d.rescued} 次`
        : d.overReason === "both-fall"
          ? `两个人都掉下去啦……走了 ${meters} 米，摔了 ${d.falls} 次`
          : `时间到啦，走了 ${meters} 米，摔了 ${d.falls} 次`;
    return {
      title: "哥俩好",
      detail,
      data: {
        finished: d.overReason === "finish",
        reason: d.overReason,
        meters,
        falls: d.falls,
        rescued: d.rescued,
        jumps: d.jumps,
      },
    };
  },
};
