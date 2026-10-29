// 哥俩好 · 端到端：实时双人跳跃、落点、掉坑挂绳、pull 救援、两人都到终点、结算。
// 单独跑：npm run smoke:game -- brothers
import { enterGame, findJournal, sleep } from "./_harness.mjs";

function platformOf(platforms, x) {
  return platforms.find((p) => x >= p.x && x <= p.x + p.w) || null;
}

/** 反推「跳 dist 这么远」需要的按住时长（和服务器同一套 tuning）。 */
function holdFor(tuning, dist) {
  const power = (dist - tuning.jumpMin) / (tuning.jumpMax - tuning.jumpMin);
  return Math.round(Math.max(0, Math.min(1, power)) * tuning.chargeMs);
}

/** 只考虑往前走：先在同一块平台挪到右边，再往下一块平台的左侧跳。 */
function planJump(d, seat) {
  const t = d.tuning;
  const me = d.mon[seat];
  const here = platformOf(d.platforms, me.x);
  if (!here) return null;
  const last = d.platforms[d.platforms.length - 1];
  let target;
  if (here === last) {
    target = Math.min(d.finishX, me.x + t.jumpMax - 8);
  } else {
    const idx = d.platforms.indexOf(here);
    const next = d.platforms[idx + 1];
    target = next.x + 26;
    if (target - me.x > t.jumpMax - 8) {
      const edge = here.x + here.w - 26;
      if (edge - me.x >= t.jumpMin + 6) target = edge;
    }
  }
  const dist = Math.max(t.jumpMin, Math.min(t.jumpMax, target - me.x));
  return { hold: holdFor(t, dist), target: me.x + dist };
}

export default async function run({ A, B, waitUntil, assert }) {
  await enterGame({
    A,
    B,
    waitUntil,
    gameId: "brothers",
    settings: { platforms: 20, spikes: "off", time: 5 },
    ready: () => A.game()?.phase === "playing",
  });

  const start = A.game();
  assert(start.platforms.length === 20, "brothers platform count");
  assert(start.mon.length === 2 && start.mon.every((m) => m.alive), "both alive at start");
  assert(!("turn" in start), "brothers is real-time (no turn field)");
  assert(start.tuning && start.tuning.jumpMin > 0 && start.tuning.chargeMs > 0, "tuning sent to client");
  assert(start.lastJump.length === 2 && start.lastPull.length === 2, "per-seat animation slots");

  // 双人同时起跳：服务端必须同时接受两个动作，并且合并成一轮状态广播。
  {
    const before = A.game().jumps;
    A.act({ type: "jump", hold: 0 });
    B.act({ type: "jump", hold: 0 });
    await waitUntil(() => {
      const d = A.game();
      return d && d.jumps >= before + 2 && d.lastJump[0] && d.lastJump[1];
    }, "brothers simultaneous jumps");
    assert(A.game().mon[0].alive && A.game().mon[1].alive, "both survive simultaneous small jumps");
    await sleep(350);
  }

  // 主动制造一次「A 掉坑 → B 拉人」，覆盖绳子救援；
  // 落点选在第一块平台和下一块之间，离两边都有足够余量，不会误判。
  {
    const d = A.game();
    const p0 = d.platforms[0];
    const p1 = d.platforms[1];
    const gapTo = Math.round((p0.x + p0.w + p1.x) / 2);
    const hold = holdFor(d.tuning, gapTo - d.mon[0].x);
    A.act({ type: "jump", hold });
    await waitUntil(() => A.game().mon[0].alive === false, "brothers A hangs on rope");
    assert(A.game().falls >= 1, "falls counted");
    // 连点救援：每点一下只涨一点卷绳进度，停手会回落。
    for (let i = 0; i < 12 && A.game().mon[0].alive === false; i++) {
      B.act({ type: "pull" });
      await sleep(50);
    }
    await waitUntil(() => A.game().mon[0].alive === true, "brothers B pulls A up");
    const after = A.game();
    assert(after.pulls >= 1 && after.rescued >= 1, "pull and rescue counted");
    assert(platformOf(after.platforms, after.mon[0].x) === platformOf(after.platforms, after.mon[1].x), "rescued onto mate platform");
  }

  let guard = 0;
  while (A.game().phase === "playing" && guard++ < 400) {
    const hanging = A.game().mon.findIndex((m) => !m.alive);
    if (hanging >= 0) {
      const rescuer = 1 - hanging;
      if (A.game().mon[rescuer].alive) {
        const client = rescuer === 0 ? A : B;
        for (let i = 0; i < 12 && A.game().mon[hanging].alive === false; i++) {
          client.act({ type: "pull" });
          await sleep(50);
        }
      }
      if (A.game().phase !== "playing") break;
    }
    for (const seat of [0, 1]) {
      const d = A.game();
      if (d.phase !== "playing") break;
      const me = d.mon[seat];
      if (!me.alive || me.finished) continue;
      if (Date.now() < (me.cooldownUntil || 0) + 20) continue;
      const plan = planJump(d, seat);
      if (!plan) continue;
      const client = seat === 0 ? A : B;
      const fromX = me.x;
      client.act({ type: "jump", hold: plan.hold });
      await waitUntil(
        () => A.game().phase === "over" || A.game().mon[seat].x !== fromX,
        `brothers jump seat ${seat} #${guard}`,
      );
    }
    await sleep(40);
  }

  await waitUntil(() => A.game().phase === "over", "brothers over");
  const end = A.game();
  assert(end.overReason === "finish", "both brothers reached the finish");
  assert(end.mon[0].finished && end.mon[1].finished, "both finished flags");
  assert(end.distance >= end.finishX, "distance covers the finish line");
  assert(end.coinsGot > 0, "coins collected along the way");

  const entry = await waitUntil(() => findJournal(A, "brothers"), "brothers journal");
  assert(entry.title === "哥俩好" && entry.data.finished === true, "brothers journal data");
  assert(entry.data.pulls >= 1 && entry.data.rescued >= 1, "brothers journal records rope rescue");
  assert(entry.data.coins > 0 && entry.data.coinTotal > 0, "brothers journal records coins");
  console.log("done: brothers simultaneous jumps / tuning data / rope fall / rapid tap rescue / coins / finish + journal");
}
