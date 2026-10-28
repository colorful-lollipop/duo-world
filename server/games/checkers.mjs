import { gameWins, otherSeat } from "./_kit.mjs";

// 8×8 西洋跳棋（爱心跳棋）：
// - 文件名 checkers.mjs 就是游戏 id
// - 服务端负责全部规则，客户端只展示和发送动作
const N = 8;
const EMPTY = -1;

function idx(r, c) {
  return r * N + c;
}
function rc(i) {
  return [Math.floor(i / N), i % N];
}
function seatOf(p) {
  return p < 0 ? -1 : p & 1;
}
function isKing(p) {
  return p >= 2;
}

function movesFrom(board, from) {
  const p = board[from];
  if (p < 0) return [];
  const seat = seatOf(p);
  const [r, c] = rc(from);
  const dirs = isKing(p)
    ? [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ]
    : seat === 0
      ? [
          [-1, -1],
          [-1, 1],
        ]
      : [
          [1, -1],
          [1, 1],
        ];
  const out = [];
  for (const [dr, dc] of dirs) {
    const r1 = r + dr;
    const c1 = c + dc;
    const r2 = r + 2 * dr;
    const c2 = c + 2 * dc;
    if (r1 >= 0 && r1 < N && c1 >= 0 && c1 < N && board[idx(r1, c1)] === EMPTY) {
      out.push({ to: idx(r1, c1), captures: [] });
    }
    if (r2 >= 0 && r2 < N && c2 >= 0 && c2 < N) {
      const mid = idx(r1, c1);
      const land = idx(r2, c2);
      const q = board[mid];
      if (q >= 0 && seatOf(q) !== seat && board[land] === EMPTY) {
        out.push({ to: land, captures: [mid] });
      }
    }
  }
  return out;
}

function legalMap(board, seat, mustCapture, chainFrom) {
  const map = {};
  if (chainFrom !== null) {
    const moves = movesFrom(board, chainFrom).filter((m) => m.captures.length > 0);
    if (moves.length) map[chainFrom] = moves;
    return map;
  }
  let anyCapture = false;
  for (let i = 0; i < board.length; i++) {
    const p = board[i];
    if (p < 0 || seatOf(p) !== seat) continue;
    const moves = movesFrom(board, i);
    if (!moves.length) continue;
    if (moves.some((m) => m.captures.length > 0)) anyCapture = true;
    map[i] = moves;
  }
  if (mustCapture && anyCapture) {
    const filtered = {};
    for (const [from, moves] of Object.entries(map)) {
      const caps = moves.filter((m) => m.captures.length > 0);
      if (caps.length) filtered[from] = caps;
    }
    return filtered;
  }
  return map;
}

function hasAnyMoves(map) {
  return Object.keys(map).length > 0;
}

function initBoard() {
  const b = Array(64).fill(EMPTY);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if ((r + c) % 2 !== 1) continue;
      if (r < 3) b[idx(r, c)] = 1;
      else if (r > 4) b[idx(r, c)] = 0;
    }
  }
  return b;
}

function finish(room, d, winner) {
  d.phase = "over";
  d.winner = winner;
  if (winner === null || winner === undefined) {
    d.draw = true;
    return;
  }
  d.draw = false;
  const wins = gameWins(room, "checkers");
  wins[winner]++;
  d.wins = [...wins];
}

function applyMove(room, d, from, to, captures) {
  const piece = d.board[from];
  d.board[from] = EMPTY;
  d.board[to] = piece;
  for (const m of captures) d.board[m] = EMPTY;
  d.last = { from, to, captures };
  d.moveCount++;
  d.quietMoves = captures.length ? 0 : d.quietMoves + 1;

  const [tr] = rc(to);
  let promoted = false;
  if (!isKing(piece) && ((seatOf(piece) === 0 && tr === 0) || (seatOf(piece) === 1 && tr === 7))) {
    d.board[to] = piece + 2;
    promoted = true;
  }

  // 连跳：吃子后如果还能继续跳，必须接着跳
  if (captures.length && !promoted) {
    const next = movesFrom(d.board, to).filter((m) => m.captures.length > 0);
    if (next.length) {
      d.chainFrom = to;
      d.legal = { [to]: next };
      return;
    }
  }

  d.chainFrom = null;
  d.turn = otherSeat(d.turn);
  const opp = d.turn;
  const oppHasPiece = d.board.some((p) => p >= 0 && seatOf(p) === opp);
  const map = legalMap(d.board, opp, d.mandatory, null);
  d.legal = map;
  if (!oppHasPiece || !hasAnyMoves(map)) {
    finish(room, d, otherSeat(opp));
  }
}

export default {
  create(room) {
    const s = room.settings.checkers || {};
    let first = 0;
    if (s.first === "TA") first = 1;
    else if (s.first === "随机") first = Math.random() < 0.5 ? 0 : 1;
    const wins = gameWins(room, "checkers");
    const d = {
      board: initBoard(),
      turn: first,
      phase: "playing",
      winner: null,
      draw: false,
      pending: null,
      chainFrom: null,
      last: null,
      moveCount: 0,
      quietMoves: 0,
      wager: s.wager || "请对方喝一杯奶茶",
      mandatory: s.mandatory === "必须吃子",
      wins: [...wins],
      legal: {},
    };
    d.legal = legalMap(d.board, d.turn, d.mandatory, null);
    return d;
  },

  action(room, seat, action) {
    const d = room.game.data;
    if (action?.type === "move") {
      if (d.phase !== "playing") return "这一局已经结束啦";
      if (d.pending) return "先处理一下 TA 的请求吧";
      if (d.turn !== seat) return "轮到 TA 走了";
      const from = Number(action.from);
      const to = Number(action.to);
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > 63 || to < 0 || to > 63) {
        return "这里不能走";
      }
      const moves = d.legal[from];
      if (!moves) return "先选一个自己的棋子";
      const move = moves.find((m) => m.to === to);
      if (!move) return "这一步走不到";
      if (d.chainFrom !== null && from !== d.chainFrom) return "还在连跳，必须从刚才落下的那格继续";
      applyMove(room, d, from, to, move.captures);
      return null;
    }
    if (action?.type === "draw") {
      if (d.phase !== "playing") return "这一局已经结束啦";
      if (d.pending) return "已经有一个请求啦";
      d.pending = { kind: "draw", by: seat };
      return null;
    }
    if (action?.type === "accept") {
      if (!d.pending) return "没有待处理的请求";
      if (d.pending.by === seat) return "等 TA 来处理吧";
      if (d.pending.kind === "draw") {
        d.phase = "over";
        d.draw = true;
        d.winner = null;
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
      if (d.phase !== "playing") return "这一局已经结束啦";
      finish(room, d, otherSeat(seat));
      d.reason = "resign";
      return null;
    }
    return "这个操作暂时不可以";
  },

  summary(room) {
    const d = room.game.data;
    if (d.draw) return { title: "爱心跳棋", detail: "握手言和 · 小约定下次再兑现" };
    const name = d.winner === null || d.winner === undefined ? null : room.seats[d.winner]?.profile?.nickname;
    return {
      title: "爱心跳棋",
      detail: `${name || "TA"} 赢了 · 小约定：${d.wager}`,
      data: { winner: d.winner },
    };
  },
};
