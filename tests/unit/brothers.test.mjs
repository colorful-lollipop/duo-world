import { describe, it, expect } from "vitest";
import brothers, { makeLevel, platformAt } from "../../server/games/brothers.mjs";
import { allDefaultSettings } from "../../server/meta.mjs";

function makeRoom(settings = {}) {
  return {
    code: "BROS01",
    createdAt: 0,
    updatedAt: 0,
    version: 0,
    seats: [
      { profile: { nickname: "小明", avatar: "bunny", color: "#FF6B6B", mood: "joy" }, token: "t0", ws: null, joinedAt: 0, lastSeen: 0 },
      { profile: { nickname: "小红", avatar: "bear", color: "#4D9DFF", mood: "joy" }, token: "t1", ws: null, joinedAt: 0, lastSeen: 0 },
    ],
    settings: { ...allDefaultSettings(), brothers: { platforms: 24, spikes: "off", time: 5, ...settings } },
    gameId: "brothers",
    game: null,
    journal: [],
    stats: { wins: {} },
    seenCids: [],
  };
}

function start(settings) {
  const room = makeRoom(settings);
  const data = brothers.create(room);
  room.game = { id: "brothers", run: "run-1", startedAt: data.startedAt, data, journaled: false };
  return { room, d: data };
}

function holdForDist(d, dist) {
  const { jumpMin, jumpMax, chargeMs } = d.tuning;
  const power = (dist - jumpMin) / (jumpMax - jumpMin);
  return Math.round(Math.max(0, Math.min(1, power)) * chargeMs);
}

/** 反推「从 fromX 跳到 targetX」需要按多久。 */
function holdFor(d, fromX, targetX) {
  return holdForDist(d, targetX - fromX);
}

function centerOf(p) {
  return p.x + Math.round(p.w / 2);
}

function platformOf(d, x) {
  return platformAt(d.platforms, x);
}

function nextPlatform(d, fromX) {
  return d.platforms.find((p) => p.x > fromX + 4);
}

/** 找一个会跳进当前平台和下一块平台之间那个坑的按住时长。 */
function gapHold(d, seat) {
  const m = d.mon[seat];
  const here = platformOf(d, m.x);
  const idx = d.platforms.indexOf(here);
  const next = d.platforms[idx + 1];
  if (!next) throw new Error("no next platform");
  const to = Math.round((here.x + here.w + next.x) / 2);
  return holdFor(d, m.x, to);
}

/** 把一个座位挪到某块平台的指定位置（测试用，跳过走路过程）。 */
function put(d, seat, x) {
  const p = platformOf(d, x);
  if (!p) throw new Error("put on no platform");
  d.mon[seat].x = x;
  d.mon[seat].y = p.y;
  d.mon[seat].alive = true;
  return p;
}

describe("哥俩好 · 关卡生成", () => {
  it("同一个 seed 生成的断桥完全一致", () => {
    const a = makeLevel(12345, 30, true);
    const b = makeLevel(12345, 30, true);
    expect(a.platforms).toEqual(b.platforms);
    expect(a.finishX).toBe(b.finishX);
  });

  it("平台数量、递增的位置、终点都在合理范围内", () => {
    const { platforms, finishX } = makeLevel(999, 24, false);
    expect(platforms).toHaveLength(24);
    expect(platforms[0].x).toBe(0);
    for (let i = 1; i < platforms.length; i++) {
      expect(platforms[i].x).toBeGreaterThan(platforms[i - 1].x + platforms[i - 1].w);
      expect(platforms[i].w).toBeGreaterThan(0);
    }
    const last = platforms[platforms.length - 1];
    expect(finishX).toBeLessThanOrEqual(last.x + last.w);
    expect(finishX).toBeGreaterThan(last.x);
  });

  it("关掉陷阱就没有尖刺，打开才可能出现；终点平台不放尖刺", () => {
    const calm = makeLevel(7, 45, false);
    expect(calm.platforms.some((p) => p.spike)).toBe(false);
    const spiky = makeLevel(7, 45, true);
    expect(spiky.platforms.some((p) => p.spike)).toBe(true);
    expect(spiky.platforms[spiky.platforms.length - 1].spike).toBe(false);
    // 尖刺平台故意生成得窄，满蓄力能跳过去，不会堵死关卡
    for (const p of spiky.platforms.filter((it) => it.spike)) {
      expect(p.w).toBeLessThanOrEqual(82);
      expect(p.w).toBeGreaterThanOrEqual(62);
    }
  });

  it("尖刺平台不会连续出现，前后的坑也收窄到能直接跳过去", () => {
    for (const seed of [7, 99, 2024]) {
      const { platforms } = makeLevel(seed, 45, true);
      for (let i = 0; i < platforms.length; i++) {
        const p = platforms[i];
        if (!p.spike) continue;
        expect(i).toBeLessThan(platforms.length - 1);
        expect(platforms[i - 1]?.spike).not.toBe(true);
        expect(platforms[i + 1]?.spike).not.toBe(true);
        const prev = platforms[i - 1];
        const next = platforms[i + 1];
        const gapBefore = p.x - (prev.x + prev.w);
        const gapAfter = next.x - (p.x + p.w);
        expect(gapBefore).toBeLessThanOrEqual(80);
        expect(gapAfter).toBeLessThanOrEqual(80);
        // 从上一块平台右边缘起跳，跳过整块尖刺落到下一块：不超过 jumpMax
        const skip = next.x + 26 - (prev.x + prev.w - 2);
        expect(skip).toBeLessThanOrEqual(300);
      }
    }
  });

  it("platformAt 只认覆盖到的位置", () => {
    const platforms = [
      { x: 0, w: 100, y: 0, spike: false },
      { x: 200, w: 100, y: 10, spike: false },
    ];
    expect(platformAt(platforms, 50)).toBe(platforms[0]);
    expect(platformAt(platforms, 150)).toBeNull();
    expect(platformAt(platforms, 250)).toBe(platforms[1]);
  });
});

describe("哥俩好 · 初始状态", () => {
  it("开局两人都活着、没有回合字段、都在起点平台", () => {
    const { d } = start();
    expect(d.phase).toBe("playing");
    expect("turn" in d).toBe(false);
    expect(d.mon).toHaveLength(2);
    for (const m of d.mon) {
      expect(m.alive).toBe(true);
      expect(m.finished).toBe(false);
      expect(m.cooldownUntil).toBe(0);
      expect(m.lastJumpAt).toBe(0);
    }
    expect(d.tuning).toMatchObject({
      jumpMin: 36,
      jumpMax: 300,
      chargeMs: 1400,
      cooldownMs: 260,
      pullCooldownMs: 900,
      jumpMs: 520,
    });
    expect(d.rope).toBe(300);
    expect(d.falls).toBe(0);
    expect(d.rescued).toBe(0);
    expect(d.pulls).toBe(0);
    expect(d.distance).toBeGreaterThan(0);
    expect(d.finishX).toBeGreaterThan(d.distance);
    expect(platformOf(d, d.mon[0].x)).toBe(d.platforms[0]);
    expect(platformOf(d, d.mon[1].x)).toBe(d.platforms[0]);
    expect(d.lastJump).toEqual([null, null]);
    expect(d.lastPull).toEqual([null, null]);
  });

  it("按设置生成对应长度的关卡，并带上时间限制", () => {
    const short = start({ platforms: 12, time: 3 });
    expect(short.d.platforms).toHaveLength(12);
    expect(short.d.timeLimit).toBe(3 * 60 * 1000);
    const long = start({ platforms: 45, time: 8 });
    expect(long.d.platforms).toHaveLength(45);
    expect(long.d.deadline - long.d.startedAt).toBe(8 * 60 * 1000);
  });
});

describe("哥俩好 · 实时跳跃", () => {
  it("双方都能立即跳，冷却各自独立", () => {
    const { room, d } = start();
    const t = d.startedAt + 1000;
    expect(brothers.action(room, 0, { type: "jump", hold: 0 }, t)).toBeNull();
    expect(brothers.action(room, 1, { type: "jump", hold: 0 }, t)).toBeNull();
    expect(d.jumps).toBe(2);
    expect(d.mon[0].cooldownUntil).toBe(t + d.tuning.cooldownMs);
    expect(d.mon[1].cooldownUntil).toBe(t + d.tuning.cooldownMs);
    expect(d.lastJump[0].seat).toBe(0);
    expect(d.lastJump[1].seat).toBe(1);
    expect(d.lastJump[0].startedAt).toBe(t);
    expect(d.lastJump[1].startedAt).toBe(t);
    // 0 号在冷却里被拒，1 号不受影响
    expect(brothers.action(room, 0, { type: "jump", hold: 0 }, t + 100)).toBeTruthy();
    expect(d.jumps).toBe(2);
    expect(brothers.action(room, 1, { type: "jump", hold: 0 }, t + d.tuning.cooldownMs)).toBeNull();
    expect(d.jumps).toBe(3);
  });

  it("轻点（hold=0）落在原地平台，不会直接掉下去", () => {
    const { room, d } = start({ spikes: "on" });
    const from = d.mon[0].x;
    const here = platformOf(d, from);
    expect(brothers.action(room, 0, { type: "jump", hold: 0 }, d.startedAt + 500)).toBeNull();
    expect(d.mon[0].alive).toBe(true);
    expect(d.falls).toBe(0);
    expect(d.mon[0].x).toBe(from + d.tuning.jumpMin);
    expect(platformOf(d, d.mon[0].x)).toBe(here);
    expect(d.mon[0].y).toBe(here.y);
    expect(d.lastJump[0].result).toBe("land");
  });

  it("按住越久跳得越远，满蓄力跳到 jumpMax", () => {
    const { room, d } = start();
    const from = d.mon[0].x;
    brothers.action(room, 0, { type: "jump", hold: 99999 }, d.startedAt + 500);
    expect(d.mon[0].alive).toBe(true);
    expect(d.mon[0].x - from).toBe(Math.max(36, Math.min(300, d.finishX + 40 - from)));
  });

  it("按住时长会被夹到 0..chargeMs，非法值会被拒绝", () => {
    const { room, d } = start();
    expect(brothers.action(room, 0, { type: "jump", hold: "abc" }, d.startedAt + 500)).toBeTruthy();
    // 负数夹到 0，等同于轻点
    expect(brothers.action(room, 0, { type: "jump", hold: -50 }, d.startedAt + 500)).toBeNull();
    expect(d.mon[0].x).toBe(62 + d.tuning.jumpMin);
    expect(d.jumps).toBe(1);
  });

  it("跳到下一块平台成功，记录最远距离与补间信息", () => {
    const { room, d } = start();
    const next = nextPlatform(d, 0);
    const from = 200; // 站在起点平台靠右的位置，一跳就能落到下一块
    const here = put(d, 0, from);
    expect(here).toBe(d.platforms[0]);
    const target = next.x + 30;
    const hold = holdFor(d, from, target);
    const t = d.startedAt + 1000;
    expect(brothers.action(room, 0, { type: "jump", hold }, t)).toBeNull();
    expect(d.mon[0].alive).toBe(true);
    expect(platformOf(d, d.mon[0].x)).toBe(next);
    expect(d.mon[0].x).toBeGreaterThan(here.x + here.w);
    expect(d.distance).toBe(d.mon[0].x);
    expect(d.mon[0].cooldownUntil).toBe(t + d.tuning.cooldownMs);
    expect(d.mon[0].lastJumpAt).toBe(t);
    expect(d.lastJump[0]).toMatchObject({ seat: 0, from, startedAt: t, ms: d.tuning.jumpMs, result: "land" });
    expect(d.lastJump[0].to).toBe(d.mon[0].x);
    expect(d.lastJump[1]).toBeNull();
  });

  it("非 jump 动作被拒绝", () => {
    const { room } = start();
    expect(brothers.action(room, 0, { type: "fly" }, 1000)).toBeTruthy();
  });
});

describe("哥俩好 · 掉坑与绳子", () => {
  it("跳空会挂在绳子上，同伴还活着就继续", () => {
    const { room, d } = start();
    const hold = gapHold(d, 0);
    expect(brothers.action(room, 0, { type: "jump", hold }, d.startedAt + 500)).toBeNull();
    expect(d.mon[0].alive).toBe(false);
    expect(d.falls).toBe(1);
    expect(d.phase).toBe("playing");
    expect(d.lastJump[0].result).toBe("hang");
    expect(d.lastJump[1]).toBeNull();
  });

  it("踩到尖刺也算掉下去", () => {
    const { room, d } = start({ spikes: "on" });
    d.platforms = [
      { x: 0, w: 230, y: 0, spike: false },
      { x: 282, w: 120, y: 0, spike: true },
      { x: 450, w: 140, y: 0, spike: false },
    ];
    d.finishX = 566;
    d.mon[0].x = 62;
    expect(brothers.action(room, 0, { type: "jump", hold: 1400 }, d.startedAt + 500)).toBeNull();
    expect(d.mon[0].alive).toBe(false);
    expect(d.falls).toBe(1);
  });

  it("挂着的人不能跳，也不能自己拉自己", () => {
    const { room, d } = start();
    const t = d.startedAt + 500;
    brothers.action(room, 0, { type: "jump", hold: gapHold(d, 0) }, t);
    expect(d.mon[0].alive).toBe(false);
    const err = brothers.action(room, 0, { type: "jump", hold: 400 }, t + 1000);
    expect(err).toBeTruthy();
    expect(err).toContain("绳");
    expect(brothers.action(room, 0, { type: "pull" }, t + 1000)).toBeTruthy();
    expect(d.pulls).toBe(0);
  });

  it("同伴落到平台上会自动把人拉上来", () => {
    const { room, d } = start();
    brothers.action(room, 0, { type: "jump", hold: gapHold(d, 0) }, d.startedAt + 500);
    expect(d.mon[0].alive).toBe(false);
    const next = nextPlatform(d, d.mon[1].x);
    const target = next.x + 30;
    const hold = holdFor(d, d.mon[1].x, target);
    expect(brothers.action(room, 1, { type: "jump", hold }, d.startedAt + 800)).toBeNull();
    expect(d.mon[1].alive).toBe(true);
    expect(d.mon[0].alive).toBe(true);
    expect(d.rescued).toBe(1);
    const land = platformOf(d, d.mon[1].x);
    expect(land).toBe(next);
    expect(platformOf(d, d.mon[0].x)).toBe(land);
    expect(Math.abs(d.mon[0].x - d.mon[1].x)).toBeLessThanOrEqual(60);
  });

  it("pull 能把同伴拉回自己平台，并记 pulls / rescued", () => {
    const { room, d } = start();
    const t = d.startedAt + 500;
    brothers.action(room, 0, { type: "jump", hold: gapHold(d, 0) }, t);
    expect(d.mon[0].alive).toBe(false);
    expect(brothers.action(room, 1, { type: "pull" }, t + 300)).toBeNull();
    expect(d.pulls).toBe(1);
    expect(d.rescued).toBe(1);
    expect(d.mon[0].alive).toBe(true);
    const land = platformOf(d, d.mon[1].x);
    expect(platformOf(d, d.mon[0].x)).toBe(land);
    expect(d.mon[0].y).toBe(land.y);
    expect(Math.abs(d.mon[0].x - d.mon[1].x)).toBeLessThanOrEqual(45);
    expect(d.lastPull[1]).toMatchObject({ seat: 1, toX: d.mon[0].x, toY: land.y, ms: d.tuning.pullMs });
    // 同伴没挂着，拉人会被拒绝
    expect(brothers.action(room, 1, { type: "pull" }, t + 1000)).toBeTruthy();
  });

  it("pull 有冷却", () => {
    const { room, d } = start();
    const t = d.startedAt + 500;
    brothers.action(room, 0, { type: "jump", hold: gapHold(d, 0) }, t);
    expect(brothers.action(room, 1, { type: "pull" }, t + 300)).toBeNull();
    expect(d.pulls).toBe(1);
    // 冷却里的第二次 pull 被拒绝
    expect(brothers.action(room, 1, { type: "pull" }, t + 400)).toBeTruthy();
    expect(d.pulls).toBe(1);
    // 让 0 号再次掉下去（等它自己的跳跃冷却），冷却结束后可以再拉
    brothers.action(room, 0, { type: "jump", hold: gapHold(d, 0) }, t + 1200);
    expect(d.mon[0].alive).toBe(false);
    expect(brothers.action(room, 1, { type: "pull" }, t + 1300)).toBeNull();
    expect(d.pulls).toBe(2);
  });

  it("绳子把挂着的人拖在同伴 ±rope 内（action 与 tick 都成立）", () => {
    const { room, d } = start();
    const t = d.startedAt + 500;
    brothers.action(room, 0, { type: "jump", hold: gapHold(d, 0) }, t);
    expect(Math.abs(d.mon[0].x - d.mon[1].x)).toBeLessThanOrEqual(d.rope);
    // 模拟同伴跳走很远：tick 应该把挂着的人拖回来
    d.mon[1].x = d.mon[0].x + d.rope + 120;
    expect(brothers.tick(room, t + 1000)).toBe(true);
    expect(Math.abs(d.mon[0].x - d.mon[1].x)).toBeLessThanOrEqual(d.rope);
    expect(brothers.tick(room, t + 1100)).toBe(false);
  });

  it("两个人都挂着就结束（both-fall）", () => {
    const { room, d } = start();
    const t = d.startedAt + 500;
    brothers.action(room, 0, { type: "jump", hold: gapHold(d, 0) }, t);
    expect(d.mon[0].alive).toBe(false);
    brothers.action(room, 1, { type: "jump", hold: gapHold(d, 1) }, t + 1);
    expect(d.mon[1].alive).toBe(false);
    expect(d.phase).toBe("over");
    expect(d.overReason).toBe("both-fall");
    expect(d.endedAt).toBeGreaterThan(0);
    const summary = brothers.summary(room);
    expect(summary.title).toBe("哥俩好");
    expect(summary.detail).toContain("两个人都掉下去");
    expect(summary.data.finished).toBe(false);
  });
});

describe("哥俩好 · 终点与结算", () => {
  it("一个人到终点只标记 finished，两个人都到才 finish", () => {
    const { room, d } = start();
    put(d, 0, d.finishX - 40);
    expect(brothers.action(room, 0, { type: "jump", hold: d.tuning.chargeMs }, d.startedAt + 500)).toBeNull();
    expect(d.mon[0].finished).toBe(true);
    expect(d.phase).toBe("playing");
    expect(d.lastJump[0].result).toBe("finish");

    put(d, 1, d.finishX - 40);
    expect(brothers.action(room, 1, { type: "jump", hold: d.tuning.chargeMs }, d.startedAt + 600)).toBeNull();
    expect(d.mon[1].finished).toBe(true);
    expect(d.phase).toBe("over");
    expect(d.overReason).toBe("finish");
    const summary = brothers.summary(room);
    expect(summary.detail).toContain("终点");
    expect(summary.data.finished).toBe(true);
  });

  it("跳过头也判 finish，不会掉坑", () => {
    const { room, d } = start();
    put(d, 0, d.finishX - 5);
    brothers.action(room, 0, { type: "jump", hold: d.tuning.chargeMs }, d.startedAt + 500);
    expect(d.mon[0].alive).toBe(true);
    expect(d.mon[0].finished).toBe(true);
    expect(d.mon[0].x).toBeGreaterThanOrEqual(d.finishX);
    expect(d.falls).toBe(0);
  });

  it("到终点的人还能拉挂着的人，拉到终点线上就算一起完成", () => {
    const { room, d } = start();
    // 窄的终点平台：被拉的人会被放在终点线之后
    d.platforms = [
      { x: 0, w: 230, y: 0, spike: false },
      { x: 300, w: 80, y: 0, spike: false },
    ];
    d.finishX = 356;
    d.mon[1] = { ...d.mon[1], x: 340, y: 0, alive: true, finished: true };
    d.mon[0] = { ...d.mon[0], x: 310, y: 4, alive: false, finished: false };
    expect(brothers.action(room, 1, { type: "pull" }, d.startedAt + 1000)).toBeNull();
    expect(d.mon[0].alive).toBe(true);
    expect(d.mon[0].x).toBeGreaterThanOrEqual(d.finishX);
    expect(d.mon[0].finished).toBe(true);
    expect(d.phase).toBe("over");
    expect(d.overReason).toBe("finish");
  });

  it("时间到会自动结束（tick）", () => {
    const { room, d } = start({ time: 3 });
    expect(brothers.tick(room, d.deadline - 1)).toBe(false);
    expect(d.phase).toBe("playing");
    expect(brothers.tick(room, d.deadline)).toBe(true);
    expect(d.phase).toBe("over");
    expect(d.overReason).toBe("time");
    expect(brothers.summary(room).detail).toContain("时间到");
  });

  it("结束后不能再 jump / pull", () => {
    const { room, d } = start({ time: 3 });
    brothers.tick(room, d.deadline);
    expect(brothers.action(room, 0, { type: "jump", hold: 100 }, d.deadline + 1)).toBeTruthy();
    expect(brothers.action(room, 0, { type: "pull" }, d.deadline + 1)).toBeTruthy();
  });

  it("summary 带上米数、摔落、互救、拉人和 finished", () => {
    const { room, d } = start();
    const t = d.startedAt + 500;
    brothers.action(room, 0, { type: "jump", hold: gapHold(d, 0) }, t);
    brothers.action(room, 1, { type: "pull" }, t + 300);
    const summary = brothers.summary(room);
    expect(summary.title).toBe("哥俩好");
    expect(typeof summary.detail).toBe("string");
    expect(summary.data).toMatchObject({
      finished: false,
      reason: "",
      falls: 1,
      rescued: 1,
      pulls: 1,
    });
    expect(summary.data.meters).toBeGreaterThan(0);
    expect(typeof summary.data.jumps).toBe("number");
  });
});
