// 深夜聊天卡 · 端到端：抽卡、收藏、换一张、聊天、结束。
// 单独跑：npm run smoke:game -- talk-cards
import { enterGame, findJournal } from "./_harness.mjs";

export default async function run({ A, B, waitUntil, assert, sleep }) {
  await enterGame({ A, B, waitUntil, gameId: "talk-cards", settings: { deck: "轻松" }, ready: () => A.game()?.phase === "draw" });

  const turn = A.game().turn;
  const turnClient = turn === 0 ? A : B;
  const otherClient = turn === 0 ? B : A;
  otherClient.act({ type: "draw" });
  await sleep(150);
  assert(turnClient.game().phase === "draw", "wrong turn rejected");

  turnClient.act({ type: "draw" });
  await waitUntil(() => turnClient.game().phase === "shown" && turnClient.game().card, "talk drawn");
  assert(turnClient.game().flipAt > Date.now() - 1000, "flip timestamp");

  // 文字聊天：两边各发一条，互相可见、座位正确、文本被 trim
  A.act({ type: "say", text: "  今晚月色真美  " });
  B.act({ type: "say", text: "  是呀，风也温柔  " });
  await waitUntil(
    () => A.game()?.messages?.length === 2 && B.game()?.messages?.length === 2,
    "talk chat visible to both",
  );
  const chatBySeat = new Map(A.game().messages.map((m) => [m.seat, m]));
  assert(chatBySeat.get(A.seat)?.text === "今晚月色真美", "chat from A trimmed");
  assert(chatBySeat.get(B.seat)?.text === "是呀，风也温柔", "chat from B trimmed");
  assert(chatBySeat.get(A.seat)?.at && chatBySeat.get(B.seat)?.at, "chat timestamps");
  assert(chatBySeat.get(A.seat)?.id !== chatBySeat.get(B.seat)?.id, "chat ids unique");

  turnClient.act({ type: "fav" });
  await waitUntil(() => turnClient.game().favorites[turn].length === 1, "talk favorite");

  const firstCardId = turnClient.game().card.id;
  turnClient.act({ type: "reroll" });
  await waitUntil(() => turnClient.game().card.id !== firstCardId && turnClient.game().phase === "shown", "talk reroll");

  const idxAfterReroll = turnClient.game().idx;
  turnClient.act({ type: "next" });
  await waitUntil(() => turnClient.game().idx === idxAfterReroll + 1 && turnClient.game().phase === "draw", "talk next");
  assert(turnClient.game().messages.length === 2, "talk chat survives reroll / next");

  const nextTurnClient = turn === 0 ? B : A;
  nextTurnClient.act({ type: "draw" });
  await waitUntil(() => nextTurnClient.game().phase === "shown", "talk second draw");
  nextTurnClient.act({ type: "finish" });
  await waitUntil(() => nextTurnClient.game().phase === "over", "talk over");
  await waitUntil(() => findJournal(A, "talk-cards"), "talk journal");
  console.log("done: talk-cards draw / favorite / turn guard / finish");
}
