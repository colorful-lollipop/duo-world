// 哥俩好（实时双人协作版）
// 两只猴子用一根绳子拴在一起，各自随时蓄力向前跳。
// 跳空了会挂在绳子上；同伴会被绳子慢慢拖向挂着的人，同时快速连点按钮把她拉上来。
// 两个人都掉下去才算输，两个人都到终点才赢；路上可以收集金币。
// 规则全部在服务端：客户端只发 { type: "jump", hold } / { type: "pull" }，服务端算出落点、绳长和金币。
import { clampInt } from "./_kit.mjs";

const BASE_Y = 84; // 平台基准高度（世界坐标，向上为正）
const ROPE = 300; // 绳子最大长度：不管什么状态，两个人都不能超过这个距离
const START_X = 62;
const FINISH_BONUS = 40; // 冲线时允许多跳出去一点，避免「跳过头」被判掉坑

/** 下发给客户端的数值，客户端不要再抄一份常量。 */
const TUNING = {
  jumpMin: 36,
  jumpMax: 300,
  chargeMs: 1400,
  cooldownMs: 260,
  jumpMs: 520,
  pullMs: 420,
  finishBonus: FINISH_BONUS,
  // 连点救援：每点一下涨进度，停手会慢慢滑回去；满了才算救上来
  reelTapGain: 14,
  reelDecayPerSec: 9,
  reelGraceMs: 900,
  // 一个人挂着时，另一个人会被绳子慢慢往挂着的人那边拖
  dragSpeed: 13,
  dragMinDist: 120,
  ropePullSpeed: 420,
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
 *
 * 金币放在非尖刺平台上，落地时自动收集；尖刺平台不放，避免「看见金币却只能踩刺」。
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
  return { platforms, finishX, coins: makeCoins(platforms, rng) };
}

/**
 * 给平台撒金币：避开第一块出生平台和尖刺平台；每块普通平台 1~2 枚。
 * 金币是共享的，谁先落地归谁（计入总收集数）。
 */
export function makeCoins(platforms, rng) {
  const coins = [];
  let id = 0;
  for (let i = 1; i < platforms.length; i++) {
    const p = platforms[i];
    if (p.spike) continue;
    const count = rng() < 0.45 ? 2 : 1;
    for (let k = 0; k < count; k++) {
      coins.push({
        id: id++,
        platform: i,
        x: Math.round(p.x + p.w * (0.32 + k * 0.36)),
        y: p.y + 40 + (k === 1 ? 10 : 0),
        taken: null,
      });
    }
  }
  return coins;
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

/** 把被拉的人放在平台内、离拉人者 40px 左右的位置。 */
function placeMate(mate, meX, land) {
  const lo = land.x + 20;
  const hi = Math.max(lo, land.x + land.w - 20);
  const left = meX - 40;
  const right = meX + 40;
  const raw = left >= lo && left <= hi ? left : right;
  return clampInt(raw, lo, hi, lo);
}

/** 落地时收集这块平台上还没被拿走的金币。 */
function collectCoins(d, seat, land, now) {
  const idx = d.platforms.indexOf(land);
  if (idx < 0) return 0;
  let amount = 0;
  for (const coin of d.coins) {
    if (coin.platform !== idx || coin.taken !== null) continue;
    coin.taken = seat;
    amount++;
  }
  if (amount > 0) {
    d.coinsGot += amount;
    d.mon[seat].coins = (d.mon[seat].coins || 0) + amount;
    d.lastCoin = { seat, amount, at: now };
  }
  return amount;
}

export default {
  create(room) {
    const s = room.settings.brothers || {};
    const count = clampInt(s.platforms, 12, 60, 30);
    const minutes = clampInt(s.time, 2, 15, 5);
    const now = Date.now();
    const seed = Math.floor(Math.random() * 0xffffffff);
    const { platforms, finishX, coins } = makeLevel(seed, count, s.spikes !== "off");
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
        { x: START_X, y: 0, alive: true, finished: false, cooldownUntil: 0, lastJumpAt: 0, coins: 0 },
        { x: START_X + 34, y: 0, alive: true, finished: false, cooldownUntil: 0, lastJumpAt: 0, coins: 0 },
      ],
      phase: "playing",
      overReason: "",
      startedAt: now,
      endedAt: 0,
      deadline: now + minutes * 60 * 1000,
      timeLimit: minutes * 60 * 1000,
      lastJump: [null, null],
      lastPull: [null, null],
      reel: [0, 0],
      reelAt: [0, 0],
      lastReel: null,
      lastCoin: null,
      coins,
      coinTotal: coins.length,
      coinsGot: 0,
      lastTickAt: now,
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
    // 兼容 1.4 之前的旧房间数据：缺少新字段时补齐，别让 tick 崩掉。
    if (!Array.isArray(d.reel)) d.reel = [0, 0];
    if (!Array.isArray(d.reelAt)) d.reelAt = [0, 0];
    if (!Array.isArray(d.coins)) {
      d.coins = [];
      d.coinTotal = 0;
      d.coinsGot = 0;
    }
    const dt = Math.min(1000, Math.max(0, now - (d.lastTickAt || now)));
    d.lastTickAt = now;
    if (d.deadline > 0 && now >= d.deadline) {
      endGame(d, "time", now);
      return true;
    }

    let changed = false;
    // 连点进度会随时间回落：停手一会儿就要重新点，救人才有紧迫感。
    for (let i = 0; i < 2; i++) {
      const me = d.mon[i];
      const mate = d.mon[1 - i];
      if (me.alive || !mate.alive) continue;
      if (d.reel[i] > 0 && now - (d.reelAt[i] || 0) > d.tuning.reelGraceMs) {
        const next = Math.max(0, d.reel[i] - (d.tuning.reelDecayPerSec * dt) / 1000);
        if (next !== d.reel[i]) {
          d.reel[i] = next;
          changed = true;
        }
      }
    }

    // 一个人挂着时，活着的那个人会被绳子慢慢往挂着的人那边拖；
    // 但只在当前平台内移动，不会因为被拖而直接掉下去。
    for (let i = 0; i < 2; i++) {
      const alive = d.mon[i];
      const hanging = d.mon[1 - i];
      if (!alive.alive || hanging.alive || alive.finished) continue;
      if (now - (alive.lastJumpAt || 0) < d.tuning.jumpMs) continue;
      const land = platformAt(d.platforms, alive.x);
      if (!land) continue;
      const gap = hanging.x - alive.x;
      if (Math.abs(gap) <= d.tuning.dragMinDist) continue;
      const dir = Math.sign(gap);
      const step = Math.min(Math.abs(gap) - d.tuning.dragMinDist, (d.tuning.dragSpeed * dt) / 1000);
      if (step <= 0) continue;
      const next = clampInt(alive.x + dir * step, land.x + 8, land.x + land.w - 8, alive.x);
      if (next !== alive.x) {
        alive.x = next;
        changed = true;
      }
    }

    // 绳子有最大长度：超出时按 ropePullSpeed 逐步拉回，不瞬移。
    for (let i = 0; i < 2; i++) {
      const me = d.mon[i];
      const mate = d.mon[1 - i];
      if (me.alive || !mate.alive) continue;
      const lo = mate.x - d.rope;
      const hi = mate.x + d.rope;
      if (me.x < lo || me.x > hi) {
        const step = Math.max(1, Math.round((d.tuning.ropePullSpeed * dt) / 1000));
        me.x = me.x < lo ? Math.min(lo, me.x + step) : Math.max(hi, me.x - step);
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
    const coins = `${d.coinsGot || 0}/${d.coinTotal || 0}`;
    const detail =
      d.overReason === "finish"
        ? `一起走到终点啦！用了 ${spent}，走了 ${meters} 米，捡了 ${coins} 枚金币，摔了 ${d.falls} 次、被救 ${d.rescued} 次`
        : d.overReason === "both-fall"
          ? `两个人都掉下去啦……走了 ${meters} 米，捡了 ${coins} 枚金币，摔了 ${d.falls} 次`
          : `时间到啦，走了 ${meters} 米，捡了 ${coins} 枚金币，摔了 ${d.falls} 次`;
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
        coins: d.coinsGot || 0,
        coinTotal: d.coinTotal || 0,
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
  const mate = d.mon[1 - seat];
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
  const rawTo = Math.min(from + dist, d.finishX + d.tuning.finishBonus);
  let to = rawTo;
  // 绳子有最大长度：即使两个人都在平台上，也不能跳到绳子拉不到的地方。
  if (mate.alive && Math.abs(to - mate.x) > d.rope) {
    to = mate.x + Math.sign(to - mate.x) * d.rope;
  }
  const ropePulled = to !== rawTo;
  let land = platformAt(d.platforms, to);
  if (!land && to >= d.finishX) {
    // 冲过头：直接算踩到终点线，别把冲线判成掉坑。
    to = d.finishX;
    land = platformAt(d.platforms, d.finishX);
  }
  const safe = !!land && !land.spike;
  const hangY = land ? land.y : fromP ? fromP.y : me.y;

  d.jumps++;
  me.lastJumpAt = now;
  me.cooldownUntil = now + d.tuning.cooldownMs;
  d.lastJump[seat] = {
    seat,
    from,
    to,
    fromY: fromP ? fromP.y : me.y,
    toY: safe ? land.y : hangY,
    rawTo,
    ropePulled,
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
    collectCoins(d, seat, land, now);
    // 同伴还挂着时不在这一帧硬拽：让下面的 tick 按 ropePullSpeed 慢慢把她拉回绳长以内，
    // 否则大跳之后她会瞬间平移，看起来像「一下子卡过去」。
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

/**
 * 连点救援：每按一下增加一点卷绳进度；进度满了才把挂着的人拉上来。
 * 不是一次点击就救上来，所以「快速连点」本身就是玩法。
 */
function pull(d, seat, now) {
  const me = d.mon[seat];
  const mate = d.mon[1 - seat];
  const mateSeat = 1 - seat;
  if (!me.alive) return "你自己还挂在绳子上，等 TA 来拉你";
  if (mate.alive) return "TA 好好的，不用拉";
  d.reel[mateSeat] = Math.min(100, (d.reel[mateSeat] || 0) + d.tuning.reelTapGain);
  d.reelAt[mateSeat] = now;
  d.lastReel = { seat, at: now, progress: d.reel[mateSeat] };
  if (d.reel[mateSeat] < 100) return null;

  // 进度满了：把同伴拉回自己站着的平台。
  const land = platformAt(d.platforms, me.x) || d.platforms[0];
  const fromX = mate.x;
  const fromY = mate.y;
  const target = me.finished ? Math.max(placeMate(mate, me.x, land), d.finishX) : placeMate(mate, me.x, land);

  mate.x = target;
  mate.y = land.y;
  mate.alive = true;
  if (mate.x >= d.finishX) mate.finished = true;
  d.reel[mateSeat] = 0;
  d.reelAt[mateSeat] = now;
  d.rescued++;
  d.pulls++;
  d.distance = Math.max(d.distance, mate.x);
  collectCoins(d, mateSeat, land, now);
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
