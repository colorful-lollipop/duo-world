// 爱心五子棋 · 端到端：落子、胜利连线、战绩、悔棋、认输。
// 单独跑：npm run smoke:game -- gomoku
import { enterGame, findJournal } from "./_harness.mjs";

export default async function run({ A, B, waitUntil, assert, sleep }) {
  // 先验证设置会被清洗回合法值（英文值进不来）
  A.send({ type: "exit" });
  await waitUntil(() => !A.state.game, "exit previous game");
  A.send({ type: "select", gameId: "gomoku" });
  await waitUntil(() => A.state.gameId === "gomoku", "select gomoku");
  A.send({ type: "settings", settings: { first: "owner", wager: "milk tea" } });
  await sleep(120);
  assert(A.state.settings.gomoku.first === "房主", "gomoku settings sanitized to default");
  A.send({ type: "settings", settings: { first: "房主", wager: "milk tea" } });
  await waitUntil(() => A.state.settings.gomoku.wager === "milk tea", "gomoku wager");
  A.send({ type: "start" });
  await waitUntil(() => A.game()?.phase === "playing", "gomoku start");
  assert(A.game().turn === 0, "gomoku first player");

  const seq = [
    [A, 0, 0],
    [B, 1, 0],
    [A, 0, 1],
    [B, 1, 1],
    [A, 0, 2],
    [B, 1, 2],
    [A, 0, 3],
    [B, 1, 3],
    [A, 0, 4],
  ];
  for (const [client, x, y] of seq) {
    client.act({ type: "place", x, y });
    await sleep(80);
  }
  await waitUntil(() => A.game().phase === "over", "gomoku over");
  assert(A.game().winner === 0 && A.game().line.length >= 5, "gomoku win + line");
  await waitUntil(() => findJournal(A, "gomoku"), "gomoku journal");
  assert(A.state.stats.wins.gomoku[0] === 1, "gomoku stats");

  A.send({ type: "start" });
  await waitUntil(() => A.game()?.phase === "playing" && A.game().move === 0, "gomoku restart");
  A.act({ type: "place", x: 7, y: 7 });
  await waitUntil(() => B.game().turn === 1, "gomoku move");
  A.act({ type: "undo" });
  await waitUntil(() => B.game().pending?.kind === "undo", "undo request");
  B.act({ type: "accept" });
  await waitUntil(() => A.game().move === 0 && A.game().turn === 0 && !A.game().pending, "undo accepted");
  A.act({ type: "resign" });
  await waitUntil(() => A.game().phase === "over" && A.game().winner === 1, "resign");
  console.log("done: gomoku win / line / journal / stats / undo / resign");
}
