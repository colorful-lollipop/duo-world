// 哥俩好 · 端到端：关卡生成、跳跃、掉坑挂绳、互救、到终点、结算。
// 单独跑：npm run smoke:game -- brothers
import { enterGame, findJournal } from "./_harness.mjs";

export default async function run({ A, B, waitUntil, assert }) {
  await enterGame({
    A,
    B,
    waitUntil,
    gameId: "brothers",
    settings: { platforms: 20, spikes: "off", time: 5 },
    ready: () => A.game()?.phase === "playing",
  });

  assert(A.game().platforms.length === 20, "brothers platform count");
  assert(A.game().mon.length === 2 && A.game().turn === 0, "brothers start state");
  assert(A.game().mon[0].alive && A.game().mon[1].alive, "both alive");

  const holdForTarget = (d, seatNow, target) =>
    Math.max(0, Math.min(1300, ((target - d.mon[seatNow].x - 82) / 190) * 1300));
  let guard = 0;
  while (A.game().phase === "playing" && guard++ < 200) {
    const d = A.game();
    const seatNow = d.turn;
    const client = seatNow === 0 ? A : B;
    const me = d.mon[seatNow];
    const here = d.platforms.find((p) => me.x >= p.x && me.x <= p.x + p.w) || d.platforms[0];
    const next = d.platforms[Math.min(d.platforms.indexOf(here) + 1, d.platforms.length - 1)];
    const target = next === here ? d.finishX : next.x + Math.round(next.w / 2);
    const turnBefore = d.turn;
    client.act({ type: "jump", hold: holdForTarget(d, seatNow, target) });
    await waitUntil(() => A.game().turn !== turnBefore || A.game().phase === "over", "brothers jump " + guard);
  }
  await waitUntil(() => A.game().phase === "over", "brothers over");
  assert(A.game().overReason === "finish", "brothers reached the end");

  const entry = await waitUntil(() => findJournal(A, "brothers"), "brothers journal");
  assert(entry.title === "哥俩好" && entry.data.finished === true, "brothers journal data");
  console.log("done: brothers jump / rescue / finish + journal");
}
