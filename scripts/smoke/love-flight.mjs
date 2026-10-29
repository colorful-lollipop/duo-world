// 爱情飞行棋：端到端冒烟（npm run smoke:game -- love-flight 可单独跑）。
// 两个客户端轮流掷骰、处理事件卡，一直玩到有人到终点，再检查纪念册。
import { enterGame, findJournal } from "./_harness.mjs";

export default async function run({ A, B, waitUntil, assert }) {
  await enterGame({
    A,
    B,
    waitUntil,
    gameId: "love-flight",
    settings: { tiles: 18 },
    ready: () => A.game()?.phase === "roll" && A.game()?.length === 18,
  });

  const start = A.game();
  assert(start.board.length === 18, "love-flight board length");
  assert(start.board[0].kind === "start", "love-flight starts at start tile");
  assert(start.board[17].kind === "finish", "love-flight ends at finish tile");
  assert(start.turn === 0 && start.pos[0] === 0 && start.pos[1] === 0, "love-flight initial positions");
  assert(start.rolls[0] === 0 && start.rolls[1] === 0, "love-flight initial rolls");
  assert(start.lastMove === null && start.moveSeq === 0, "love-flight initial move metadata");

  // 不是当前回合的座位掷骰子必须被拒绝，状态不变。
  const errBefore = B.errors.length;
  B.act({ type: "roll" });
  await waitUntil(() => B.errors.length > errBefore, "love-flight off-turn roll rejected");
  assert(A.game().turn === 0 && A.game().rolls[1] === 0, "love-flight off-turn roll did not change state");
  console.log("done: love-flight off-turn roll rejected");

  const clients = [A, B];
  let finished = false;
  for (let i = 0; i < 200; i++) {
    const d = A.game();
    if (!d) break;
    if (d.phase === "over") {
      finished = true;
      break;
    }
    if (d.phase === "roll") {
      const seat = d.turn;
      const before = d.rolls[seat];
      clients[seat].act({ type: "roll" });
      await waitUntil(() => {
        const s = A.game();
        return !!s && (s.phase === "over" || s.phase === "event" || s.rolls[seat] > before);
      }, "love-flight roll");
    } else if (d.phase === "event") {
      assert(d.event && typeof d.event.title === "string" && d.event.title.length > 0, "event card title");
      assert(typeof d.event.text === "string" && d.event.text.length > 0, "event card text");
      const seat = d.turn;
      clients[seat].act({ type: "resolve" });
      await waitUntil(() => A.game() && A.game().phase !== "event", "love-flight resolve");
    } else {
      throw new Error("love-flight 意外状态：" + d.phase);
    }
  }

  assert(finished || A.game().phase === "over", "love-flight finished within 200 turns");

  const final = A.game();
  assert(final.winner === 0 || final.winner === 1, "love-flight winner");
  assert(final.phase === "over", "love-flight phase over");
  assert(final.pos[final.winner] === final.length - 1, "love-flight winner on finish tile");
  assert(final.closing && final.closing.forSeat === 1 - final.winner, "love-flight closing for loser");
  assert(typeof final.closing.text === "string" && final.closing.text.length > 0, "love-flight closing text");
  assert(final.rolls[0] + final.rolls[1] > 0, "love-flight rolls counted");
  assert(final.lastMove && Array.isArray(final.lastMove.from) && Array.isArray(final.lastMove.to), "love-flight lastMove shape");
  assert(final.lastMove.to[final.winner] === final.length - 1, "love-flight lastMove ends on finish");
  assert(final.moveSeq >= final.rolls[0] + final.rolls[1], "love-flight move metadata advances");
  console.log("done: love-flight roll / event / finish / closing");

  await waitUntil(() => findJournal(A, "love-flight"), "love-flight journal");
  await waitUntil(() => findJournal(A, "love-flight")?.data, "love-flight journal data");
  const entry = findJournal(A, "love-flight");
  assert(entry.data.winner === final.winner, "journal winner");
  assert(entry.data.closing && entry.data.closing.text === final.closing.text, "journal closing");
  assert(typeof entry.detail === "string" && entry.detail.includes("先到终点"), "journal detail");
  console.log("done: love-flight journal + stats");
}
