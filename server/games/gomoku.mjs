import { gameWins } from "./_kit.mjs";

const SIZE = 15;
const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

function idx(x, y) {
  return y * SIZE + x;
}

function winLine(board, x, y, seat) {
  for (const [dx, dy] of DIRS) {
    const cells = [idx(x, y)];
    for (const sign of [1, -1]) {
      let nx = x + dx * sign;
      let ny = y + dy * sign;
      while (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE && board[idx(nx, ny)] === seat) {
        cells.push(idx(nx, ny));
        nx += dx * sign;
        ny += dy * sign;
      }
    }
    if (cells.length >= 5) {
      cells.sort((a, b) => a - b);
      return cells;
    }
  }
  return null;
}

export default {
  create(room) {
    const s = room.settings.gomoku || {};
    let first = 0;
    if (s.first === "TA") first = 1;
    else if (s.first === "随机") first = Math.random() < 0.5 ? 0 : 1;
    const wins = gameWins(room, "gomoku");
    return {
      board: Array(SIZE * SIZE).fill(-1),
      turn: first,
      move: 0,
      last: null,
      moves: [],
      line: [],
      winner: null,
      draw: false,
      pending: null,
      phase: "playing",
      reason: "",
      wager: s.wager || "请对方喝一杯奶茶",
      wins: [...wins],
    };
  },

  action(room, seat, action, now) {
    const d = room.game.data;
    if (action?.type === "place") {
      if (d.phase === "over") return "这一局已经结束啦";
      if (d.pending) return "先处理一下 TA 的请求吧";
      if (d.turn !== seat) return "轮到 TA 落子啦";
      const x = Number(action.x);
      const y = Number(action.y);
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 14 || y < 0 || y > 14) return "这里不能落子";
      const i = idx(x, y);
      if (d.board[i] !== -1) return "这里已经有棋子啦";
      d.board[i] = seat;
      d.move++;
      d.last = { x, y, seat };
      d.moves.push({ x, y, seat });
      const line = winLine(d.board, x, y, seat);
      if (line) {
        d.line = line;
        d.winner = seat;
        d.phase = "over";
        d.reason = "five";
        const wins = gameWins(room, "gomoku");
        wins[seat]++;
        d.wins = [...wins];
        return null;
      }
      if (d.move >= SIZE * SIZE) {
        d.draw = true;
        d.phase = "over";
        d.reason = "draw";
        return null;
      }
      d.turn = 1 - seat;
      return null;
    }
    if (action?.type === "undo") {
      if (d.phase === "over") return "这一局已经结束啦";
      if (d.pending) return "已经有一个请求啦";
      const last = d.moves[d.moves.length - 1];
      if (!last) return "还没有可以悔的棋";
      if (last.seat !== seat) return "只能悔自己刚下的一步哦";
      d.pending = { kind: "undo", by: seat };
      return null;
    }
    if (action?.type === "draw") {
      if (d.phase === "over") return "这一局已经结束啦";
      if (d.pending) return "已经有一个请求啦";
      d.pending = { kind: "draw", by: seat };
      return null;
    }
    if (action?.type === "accept") {
      if (!d.pending) return "没有待处理的请求";
      if (d.pending.by === seat) return "等 TA 来处理吧";
      if (d.pending.kind === "undo") {
        const last = d.moves.pop();
        d.board[idx(last.x, last.y)] = -1;
        d.move--;
        d.last = d.moves.length ? d.moves[d.moves.length - 1] : null;
        d.turn = last.seat;
        d.line = [];
      } else {
        d.draw = true;
        d.phase = "over";
        d.reason = "agree-draw";
      }
      d.pending = null;
      return null;
    }
    if (action?.type === "decline" || action?.type === "cancel") {
      if (!d.pending) return "没有待处理的请求";
      if (action.type === "cancel" && d.pending.by !== seat) return "这不是你的请求";
      if (action.type === "decline" && d.pending.by === seat) return "等 TA 来处理吧";
      d.pending = null;
      return null;
    }
    if (action?.type === "resign") {
      if (d.phase === "over") return "这一局已经结束啦";
      d.phase = "over";
      d.winner = 1 - seat;
      d.reason = "resign";
      const wins = gameWins(room, "gomoku");
      wins[1 - seat]++;
      d.wins = [...wins];
      return null;
    }
    return "这个操作暂时不可以";
  },

  summary(room) {
    const d = room.game.data;
    if (d.draw) return { title: "爱心五子棋", detail: "握手言和 · 小约定下次再兑现" };
    if (d.winner === null || d.winner === undefined) return { title: "爱心五子棋", detail: "这一局结束了" };
    const name = room.seats[d.winner]?.profile?.nickname || "TA";
    return {
      title: "爱心五子棋",
      detail: `${name} 赢了 · 小约定：${d.wager}`,
      data: { winner: d.winner },
    };
  },
};
