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

/** 反推「跳 to 目标点」需要按多久。 */
function holdFor(fromX, targetX) {
  const dist = targetX - fromX;
  return Math.max(0, Math.min(1300, ((dist - 82) / 190) * 1300));
}

function centerOf(p) {
  return p.x + Math.round(p.w / 2);
}

function nextPlatform(d, fromX) {
  return d.platforms.find((p) => p.x > fromX + 4);
}

/** 找一个「会跳进坑里」的按住时长。 */
function fallingHold(d, fromX) {
  for (let hold = 0; hold <= 1300; hold += 20) {
    const dist = Math.round(82 + 190 * Math.min(1, hold / 1300));
    const to = Math.min(fromX + dist, d.finishX + 40);
    if (to < d.finishX && !platformAt(d.platforms, to)) return hold;
  }
  return null;
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

  it("关掉陷阱就没有尖刺，打开才可能出现", () => {
    const calm = makeLevel(7, 45, false);
    expect(calm.platforms.some((p) => p.spike)).toBe(false);
    const spiky = makeLevel(7, 45, true);
    expect(spiky.platforms.some((p) => p.spike)).toBe(true);
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
  it("两只猴子都站在起点，房主先跳", () => {
    const { d } = start();
    expect(d.phase).toBe("playing");
    expect(d.mon).toHaveLength(2);
    expect(d.mon[0].alive).toBe(true);
    expect(d.mon[1].alive).toBe(true);
    expect(d.turn).toBe(0);
    expect(d.falls).toBe(0);
    expect(d.rescued).toBe(0);
    expect(d.distance).toBeGreaterThan(0);
    expect(d.finishX).toBeGreaterThan(d.distance);
    expect(platformAt(d.platforms, d.mon[0].x)).not.toBeNull();
    expect(platformAt(d.platforms, d.mon[1].x)).not.toBeNull();
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

describe("哥俩好 · 轮流跳跃", () => {
  it("不是自己的回合不能跳，且状态不变", () => {
    const { room, d } = start();
    const before = JSON.stringify(d.mon);
    const err = brothers.action(room, 1, { type: "jump", hold: 600 }, Date.now());
    expect(typeof err).toBe("string");
    expect(err).toContain("TA");
    expect(JSON.stringify(d.mon)).toBe(before);
    expect(d.turn).toBe(0);
    expect(d.jumps).toBe(0);
  });

  it("不能把 hold 传成负数或非数字", () => {
    const { room, d } = start();
    expect(brothers.action(room, 0, { type: "jump", hold: -10 }, Date.now())).toBeTruthy();
    expect(brothers.action(room, 0, { type: "jump", hold: "abc" }, Date.now())).toBeTruthy();
    expect(d.jumps).toBe(0);
  });

  it("非 jump 动作被拒绝", () => {
    const { room } = start();
    expect(brothers.action(room, 0, { type: "fly" }, Date.now())).toBeTruthy();
  });

  it("轻点小跳、长按大跳，距离在 82~272 之间", () => {
    const { room, d } = start({ spikes: "off" });
    const from0 = d.mon[0].x;
    expect(brothers.action(room, 0, { type: "jump", hold: 0 }, Date.now())).toBeNull();
    const short = d.lastJump;
    expect(short.to - from0).toBe(82);
    const from1 = d.mon[1].x;
    expect(brothers.action(room, 1, { type: "jump", hold: 99999 }, Date.now())).toBeNull();
    expect(d.lastJump.to - from1).toBe(272);
  });

  it("跳成功后换对方行动，并且记录了补间信息", () => {
    const { room, d } = start();
    const now = Date.now();
    expect(brothers.action(room, 0, { type: "jump", hold: 0 }, now)).toBeNull();
    expect(d.turn).toBe(1);
    expect(d.lastJump.seat).toBe(0);
    expect(d.lastJump.startedAt).toBe(now);
    expect(d.lastJump.ms).toBeGreaterThan(0);
    expect(d.jumps).toBe(1);
    expect(d.mon[0].alive).toBe(true);
  });

  it("跳到下一块平台上会更新最远距离", () => {
    const { room, d } = start();
    const target = centerOf(nextPlatform(d, d.mon[0].x));
    const hold = holdFor(d.mon[0].x, target);
    expect(brothers.action(room, 0, { type: "jump", hold }, Date.now())).toBeNull();
    expect(d.mon[0].alive).toBe(true);
    expect(d.mon[0].x).toBeGreaterThan(d.platforms[0].x + d.platforms[0].w);
    expect(d.distance).toBe(d.mon[0].x);
    expect(platformAt(d.platforms, d.mon[0].x)).not.toBeNull();
  });
});

describe("哥俩好 · 掉坑与互相救援", () => {
  it("跳空了会挂在绳子上，而不是直接出局", () => {
    const { room, d } = start();
    const hold = fallingHold(d, d.mon[0].x);
    expect(hold).not.toBeNull();
    expect(brothers.action(room, 0, { type: "jump", hold }, Date.now())).toBeNull();
    expect(d.mon[0].alive).toBe(false);
    expect(d.falls).toBe(1);
    expect(d.phase).toBe("playing");
    expect(d.turn).toBe(1);
  });

  it("挂着的时候自己不能动", () => {
    const { room, d } = start();
    brothers.action(room, 0, { type: "jump", hold: fallingHold(d, d.mon[0].x) }, Date.now());
    d.turn = 0; // 强行把回合交回给它，验证服务端仍然拦住
    const err = brothers.action(room, 0, { type: "jump", hold: 400 }, Date.now());
    expect(err).toBeTruthy();
    expect(err).toContain("绳子");
  });

  it("同伴跳到平台上会把你拉上来", () => {
    const { room, d } = start();
    brothers.action(room, 0, { type: "jump", hold: fallingHold(d, d.mon[0].x) }, Date.now());
    expect(d.mon[0].alive).toBe(false);
    const target = centerOf(nextPlatform(d, d.mon[1].x));
    const hold = holdFor(d.mon[1].x, target);
    expect(brothers.action(room, 1, { type: "jump", hold }, Date.now())).toBeNull();
    expect(d.mon[1].alive).toBe(true);
    expect(d.mon[0].alive).toBe(true);
    expect(d.rescued).toBe(1);
    expect(d.turn).toBe(0);
    const land = platformAt(d.platforms, d.mon[1].x);
    expect(platformAt(d.platforms, d.mon[0].x)).toBe(land);
  });

  it("掉下去的人会被绳子拖在同伴身边", () => {
    const { room, d } = start();
    brothers.action(room, 0, { type: "jump", hold: fallingHold(d, d.mon[0].x) }, Date.now());
    expect(Math.abs(d.mon[0].x - d.mon[1].x)).toBeLessThanOrEqual(d.rope + 1);
  });

  it("两个人都掉下去就结束，结算写明原因", () => {
    const { room, d } = start();
    brothers.action(room, 0, { type: "jump", hold: fallingHold(d, d.mon[0].x) }, Date.now());
    const hold2 = fallingHold(d, d.mon[1].x);
    expect(hold2).not.toBeNull();
    brothers.action(room, 1, { type: "jump", hold: hold2 }, Date.now());
    expect(d.phase).toBe("over");
    expect(d.overReason).toBe("both-fall");
    expect(d.endedAt).toBeGreaterThan(0);
    const summary = brothers.summary(room);
    expect(summary.title).toBe("哥俩好");
    expect(summary.detail).toContain("两个人都掉下去");
    expect(summary.data.finished).toBe(false);
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
    expect(brothers.action(room, 0, { type: "jump", hold: 1300 }, Date.now())).toBeNull();
    expect(d.mon[0].alive).toBe(false);
    expect(d.falls).toBe(1);
  });
});

describe("哥俩好 · 结束条件", () => {
  it("走到终点算赢，跳过头也不会被判成掉坑", () => {
    const { room, d } = start();
    d.mon[0].x = d.finishX - 40;
    expect(brothers.action(room, 0, { type: "jump", hold: 1300 }, Date.now())).toBeNull();
    expect(d.phase).toBe("over");
    expect(d.overReason).toBe("finish");
    const summary = brothers.summary(room);
    expect(summary.title).toBe("哥俩好");
    expect(summary.detail).toContain("终点");
    expect(summary.data.finished).toBe(true);
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

  it("结束后不能再跳", () => {
    const { room, d } = start({ time: 3 });
    brothers.tick(room, d.deadline);
    expect(brothers.action(room, 0, { type: "jump", hold: 100 }, Date.now())).toBeTruthy();
  });

  it("结算数据带上米数、摔跤和救援次数", () => {
    const { room, d } = start();
    const summary = brothers.summary(room);
    expect(summary.title).toBe("哥俩好");
    expect(typeof summary.detail).toBe("string");
    expect(summary.detail.length).toBeGreaterThan(0);
    expect(summary.data.meters).toBeGreaterThan(0);
    expect(summary.data.falls).toBe(0);
    expect(summary.data.rescued).toBe(0);
  });
});
