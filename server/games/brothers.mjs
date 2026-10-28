// 哥俩好（实时双人协作版）
// 两只猴子用一根绳子拴在一起，各自随时蓄力向前跳。
// 跳空了会挂在绳子上，同伴跳到平台上会自动把你拉上来，也可以按「拉 TA 一把」。
// 两个人都掉下去才算输，两个人都到终点才赢。
// 规则全部在服务端：客户端只发 { type: "jump", hold } / { type: "pull" }，服务端算出落点。
import { clampInt } from "./_kit.mjs";

const BASE_Y = 84; // 平台基准高度（世界坐标，向上为正）
const ROPE = 300; // 绳长：掉下去的人被拖在同伴这根绳子的范围里
const START_X = 62;
const FINISH_BONUS = 40; // 冲线时允许多跳出去一点，避免「跳过头」被判掉坑

/** 下发给客户端的数值，客户端不要再抄一份常量。 */
const TUNING = {
  jumpMin: 36,
  jumpMax: 300,
  chargeMs: 1400,
  cooldownMs: 260,
  pullCooldownMs: 900,
  jumpMs: 520,
  pullMs: 420,
};

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

/**
 * 生成一条从左到右的断桥：x 是左边缘，w 是宽度，y 是相对基准的高度，spike 是尖刺陷阱。
 * 尖刺平台会生成得窄一些（62..82）、不会连续出现，前后的坑也收窄，保证满蓄力
 * 可以跳过它，不会出现「整关被尖刺堵死」的死局；最后一块平台永远不放尖刺（那是终点）。
 */
export function makeLevel(seed, count, spikes) {
  const rng = mulberry32(seed);
  const platforms = [{ x: 0, w: 230, y: 0, spike: false }];
  let x = 0;
  let y = 0;
  let prevW = 230;
  let prevSpike = false;
  for (let i = 1; i < count; i++) {
    let gap = 52 + Math.round(rng() * (28 + Math.min(110, i * 3)));
    let w = 92 + Math.round(rng() * (58 + Math.min(80, i)));
    y = clampInt(y + (rng() - 0.5) * 46, -70, 70, 0);
    const spike = !!spikes && i >= 4 && i < count - 1 && !prevSpike && rng() < 0.14;
    if (spike) w = 62 + Math.round(rng() * 20);
    // 尖刺前后的坑都别太宽：玩家要能直接跳过整块尖刺平台，不会被堵死。
    if (spike || prevSpike) gap = Math.min(gap, 80);
    x += prevW + gap;
    platforms.push({ x, w, y, spike });
    prevW = w;
    prevSpike = spike;
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
  if (d.phase === "over") return;
  d.phase = "over";
  d.overReason = reason;
  d.endedAt = now;
}

/** 两个人都到终点才算赢。 */
function finishIfBoth(d, now) {
  if (d.mon[0].finished && d.mon[1].finished) endGame(d, "finish", now);
}

/** 挂着的人是否在绳子够得着的范围内（同伴身边，或者落点平台边上）。 */
function withinReach(x, anchorX, land, rope) {
  if (Math.abs(x - anchorX) <= rope) return true;
  const dx = Math.max(0, land.x - x, x - (land.x + land.w));
  return dx <= rope;
}

/** 把被拉的人放在平台内、离拉人者 40px 左右的位置。 */
function placeMate(mate, meX, land) {
  const lo = land.x + 20;
  const hi = Math.max(lo, land.x + land.w - 20);
  const left = meX - 40;
  const right = meX + 40;
  const raw = left >= lo && left <= hi ? left : right;
  return clampInt(raw, lo, hi, lo);
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
      tuning: { ...TUNING },
      mon: [
        { x: START_X, y: 0, alive: true, finished: false, cooldownUntil: 0, lastJumpAt: 0, pullReadyAt: 0 },
        { x: START_X + 34, y: 0, alive: true, finished: false, cooldownUntil: 0, lastJumpAt: 0, pullReadyAt: 0 },
      ],
      phase: "playing",
      overReason: "",
      startedAt: now,
      endedAt: 0,
      deadline: now + minutes * 60 * 1000,
      timeLimit: minutes * 60 * 1000,
      lastJump: [null, null],
      lastPull: [null, null],
      falls: 0,
      rescued: 0,
      pulls: 0,
      jumps: 0,
      distance: START_X + 34,
    };
  },

  action(room, seat, action, now) {
    const d = room.game.data;
    if (d.phase !== "playing") return "这一局已经结束啦";
    if (action?.type === "jump") return jump(d, seat, action, now);
    if (action?.type === "pull") return pull(d, seat, now);
    return "这个操作暂时不可以";
  },

  tick(room, now) {
    const d = room.game?.data;
    if (!d || d.phase !== "playing") return false;
    if (d.deadline > 0 && now >= d.deadline) {
      endGame(d, "time", now);
      return true;
    }
    // 同伴跳走以后，把还挂着的人沿绳子拖过来，别让绳子无限拉长。
    let changed = false;
    for (let i = 0; i < 2; i++) {
      const me = d.mon[i];
      const mate = d.mon[1 - i];
      if (me.alive || !mate.alive) continue;
      const lo = mate.x - d.rope;
      const hi = mate.x + d.rope;
      if (me.x < lo || me.x > hi) {
        me.x = clampInt(me.x, lo, hi, me.x);
        me.y = mate.y;
        changed = true;
      }
    }
    return changed;
  },

  summary(room) {
    const d = room.game.data;
    const spent = fmtTime((d.endedAt || Date.now()) - d.startedAt);
    const meters = Math.max(1, Math.round(d.distance / 30));
    const pulls = d.pulls || 0;
    const detail =
      d.overReason === "finish"
        ? `一起走到终点啦！用了 ${spent}，走了 ${meters} 米，摔了 ${d.falls} 次、被救 ${d.rescued} 次、拉了 ${pulls} 把`
        : d.overReason === "both-fall"
          ? `两个人都掉下去啦……走了 ${meters} 米，摔了 ${d.falls} 次、拉了 ${pulls} 把`
          : `时间到啦，走了 ${meters} 米，摔了 ${d.falls} 次、拉了 ${pulls} 把`;
    return {
      title: "哥俩好",
      detail,
      data: {
        finished: d.overReason === "finish",
        reason: d.overReason,
        meters,
        falls: d.falls,
        rescued: d.rescued,
        pulls,
        jumps: d.jumps,
      },
    };
  },
};

/**
 * 跳跃：hold 毫秒 → 距离（jumpMin..jumpMax），落点由服务端决定。
 * 成功落在非尖刺平台（或者冲过终点线）才算站住；否则挂到绳子上。
 */
function jump(d, seat, action, now) {
  const me = d.mon[seat];
  if (!me.alive) return "你挂在绳子上，等 TA 拉你上来";
  if (me.finished) return "你已经到终点啦，去拉 TA 一把吧";
  if (now < (me.cooldownUntil || 0)) return "刚落地，喘口气再跳";
  const rawHold = Number(action.hold);
  if (!Number.isFinite(rawHold)) return "这一跳不太对";
  // 短按也至少是 jumpMin；长按按 chargeMs 封顶，客户端多按一会儿也不会更远。
  const hold = Math.max(0, Math.min(d.tuning.chargeMs, rawHold));
  const power = hold / d.tuning.chargeMs;
  const dist = Math.round(d.tuning.jumpMin + (d.tuning.jumpMax - d.tuning.jumpMin) * power);
  const from = me.x;
  const fromP = platformAt(d.platforms, from);
  let to = Math.min(from + dist, d.finishX + FINISH_BONUS);
  let land = platformAt(d.platforms, to);
  if (!land && to >= d.finishX) {
    // 冲过头：直接算踩到终点线，别把冲线判成掉坑。
    to = d.finishX;
    land = platformAt(d.platforms, d.finishX);
  }
  const safe = !!land && !land.spike;
  const hangY = land ? land.y : fromP ? fromP.y : me.y;
  const mate = d.mon[1 - seat];

  d.jumps++;
  me.lastJumpAt = now;
  me.cooldownUntil = now + d.tuning.cooldownMs;
  d.lastJump[seat] = {
    seat,
    from,
    to,
    fromY: fromP ? fromP.y : me.y,
    toY: safe ? land.y : hangY,
    startedAt: now,
    ms: d.tuning.jumpMs,
    result: safe ? (to >= d.finishX ? "finish" : "land") : "hang",
  };

  if (safe) {
    me.x = to;
    me.y = land.y;
    me.alive = true;
    if (to >= d.finishX) me.finished = true;
    d.distance = Math.max(d.distance, me.x);
    if (!mate.alive) {
      if (withinReach(mate.x, me.x, land, d.rope)) {
        // 同伴还挂在绳子上：落地的同时把他拽上这块平台。
        mate.x = placeMate(mate, me.x, land);
        mate.y = land.y;
        mate.alive = true;
        if (mate.x >= d.finishX) mate.finished = true;
        d.rescued++;
        d.distance = Math.max(d.distance, mate.x);
      } else {
        // 够不着就只是被绳子拖近一点，仍然挂着。
        mate.x = clampInt(mate.x, me.x - d.rope, me.x + d.rope, mate.x);
        mate.y = land.y;
      }
    }
    d.lastJump[seat].result = me.finished ? "finish" : "land";
    finishIfBoth(d, now);
    return null;
  }

  // 跳空 / 踩尖刺：挂在绳子上，等同伴来救。
  me.x = to;
  me.y = hangY;
  me.alive = false;
  d.falls++;
  if (!mate.alive) {
    endGame(d, "both-fall", now);
    return null;
  }
  me.x = clampInt(to, mate.x - d.rope, mate.x + d.rope, to);
  return null;
}

/** 拉人：把挂着的人拽回自己所在的平台。 */
function pull(d, seat, now) {
  const me = d.mon[seat];
  const mate = d.mon[1 - seat];
  if (!me.alive) return "你自己还挂在绳子上，等 TA 来拉你";
  if (mate.alive) return "TA 好好的，不用拉";
  if (now < (me.pullReadyAt || 0)) return "绳子还没收回来，等一下";
  const land = platformAt(d.platforms, me.x) || d.platforms[0];
  const fromX = mate.x;
  const fromY = mate.y;
  const target = placeMate(mate, me.x, land);

  mate.x = target;
  mate.y = land.y;
  mate.alive = true;
  if (mate.x >= d.finishX) mate.finished = true;
  me.pullReadyAt = now + d.tuning.pullCooldownMs;
  d.rescued++;
  d.pulls++;
  d.distance = Math.max(d.distance, mate.x);
  d.lastPull[seat] = {
    seat,
    fromX,
    fromY,
    toX: mate.x,
    toY: mate.y,
    startedAt: now,
    ms: d.tuning.pullMs,
  };
  finishIfBoth(d, now);
  return null;
}
