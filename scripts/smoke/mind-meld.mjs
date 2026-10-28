// 心有灵犀 · 端到端：提交、揭晓、双方确认、词链、结算。
// 单独跑：npm run smoke:game -- mind-meld
import { enterGame, findJournal } from "./_harness.mjs";

export default async function run({ A, B, waitUntil, assert, sleep }) {
  await enterGame({
    A,
    B,
    waitUntil,
    gameId: "mind-meld",
    settings: { rounds: 6 },
    ready: () => A.game()?.phase === "submit" && B.game()?.phase === "submit",
  });

  assert(Array.isArray(A.game().prompts) && A.game().prompts.length === 6, "mind prompts at start");

  A.act({ type: "submit", word: "sea" });
  await sleep(100);
  assert(A.game().submitted[0] === "sea", "first word stored");
  B.act({ type: "submit", word: "cat" });
  await waitUntil(() => A.game().phase === "reveal", "mind reveal");
  assert(A.game().history.length === 1 && A.game().history[0].matched === false, "different words");

  A.act({ type: "agree" });
  B.act({ type: "agree" });
  await waitUntil(() => A.game().roundMatched === true && A.game().matched === 1, "mind agreement");

  A.act({ type: "next" });
  await waitUntil(() => A.game().round === 1 && A.game().phase === "submit", "mind round 2");
  const chainWords = A.game().history.flatMap((h) => [h.a, h.b]);
  assert(
    Array.isArray(A.game().prompts) &&
      A.game().prompts.length === 6 &&
      A.game().prompts.every((p) => !chainWords.includes(p)),
    "mind prompts exclude chain",
  );
  A.act({ type: "submit", word: "fish" });
  B.act({ type: "submit", word: "fish" });
  await waitUntil(() => A.game().history[1]?.matched === true && A.game().matched === 2, "mind exact match");

  for (let r = 2; r < 6; r++) {
    A.act({ type: "next" });
    await waitUntil(() => A.game().round === r && A.game().phase === "submit", "mind round " + (r + 1));
    A.act({ type: "submit", word: "w" + r });
    B.act({ type: "submit", word: "x" + r });
    await waitUntil(() => A.game().phase === "reveal", "mind reveal " + r);
  }
  A.act({ type: "next" });
  await waitUntil(() => A.game().phase === "over", "mind over");

  const entry = await waitUntil(() => findJournal(A, "mind-meld"), "mind journal");
  assert(entry.data.matched === 2, "mind journal data");
  console.log("done: mind-meld flow + journal");
}
