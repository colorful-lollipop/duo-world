// 爱心跳棋 · 端到端：初始棋盘、合法走法、走子、求和、认输、战绩。
// 单独跑：npm run smoke:game -- checkers
import { enterGame, findJournal } from "./_harness.mjs";

export default async function run({ A, B, waitUntil, assert }) {
  await enterGame({
    A,
    B,
    waitUntil,
    gameId: "checkers",
    settings: { first: "房主", mandatory: "必须吃子", wager: "milk tea" },
    ready: () => A.game()?.phase === "playing",
  });

  assert(A.game().board.length === 64, "checkers board size");
  assert(A.game().board.filter((p) => p === 0).length === 12, "red pieces");
  assert(A.game().board.filter((p) => p === 1).length === 12, "blue pieces");
  assert(A.game().turn === 0, "checkers first player");
  assert(Object.keys(A.game().legal).length > 0, "checkers legal moves");

  const firstFrom = Number(Object.keys(A.game().legal)[0]);
  const firstMove = A.game().legal[firstFrom][0];
  A.act({ type: "move", from: firstFrom, to: firstMove.to });
  await waitUntil(() => A.game().turn === 1 && A.game().moveCount === 1, "checkers move");
  assert(A.game().board[firstMove.to] === 0, "checkers piece moved");

  const bFrom = Number(Object.keys(B.game().legal)[0]);
  const bMove = B.game().legal[bFrom][0];
  B.act({ type: "move", from: bFrom, to: bMove.to });
  await waitUntil(() => A.game().turn === 0 && A.game().moveCount === 2, "checkers counter move");

  B.act({ type: "draw" });
  await waitUntil(() => A.game().pending?.kind === "draw", "checkers draw request");
  A.act({ type: "accept" });
  await waitUntil(() => A.game().phase === "over" && A.game().draw === true, "checkers draw accepted");
  await waitUntil(() => findJournal(A, "checkers"), "checkers journal");

  A.send({ type: "start" });
  await waitUntil(() => A.game()?.phase === "playing" && A.game().moveCount === 0, "checkers restart");
  A.act({ type: "resign" });
  await waitUntil(() => A.game().phase === "over" && A.game().winner === 1, "checkers resign");
  assert(A.state.stats.wins.checkers[1] === 1, "checkers stats");
  console.log("done: checkers move / draw / resign / stats");
}
