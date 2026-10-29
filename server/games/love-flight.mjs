// 爱情飞行棋：服务端规则（文件名 = 游戏 id）。
// 两人各一颗棋子，从 0 号格出发，轮流掷 1–6 点往前走；
// 踩到事件格要先把卡处理完（resolve），才轮到下一个人。
import { gameWins, otherSeat } from "./_kit.mjs";
import { LAYOUTS, KIND_META, truthCards, taskCards, closingCards, pickCard } from "./_love-flight.cards.mjs";

const ID = "love-flight";
const SIZES = [18, 24, 30];

/** 站点文案：事件卡标题 & 说明。 */
const EVENT_TEXT = {
  forward: "一路顺风，再往前走 2 格。",
  back: "遇到一点小插曲，往后退 2 格。",
  swap: "缘分转了个弯，和 TA 交换棋子位置。",
  again: "今天运气不错，同一个回合再掷一次。"
};

/** 生成棋盘。只接受 18 / 24 / 30，其它值回退到 24。 */
export function makeBoard(length) {
  const n = Number(length);
  const size = SIZES.includes(n) ? n : 24;
  return LAYOUTS[size].map((kind, index) => {
    const meta = KIND_META[kind] || KIND_META.plain;
    return { index, kind, emoji: meta.emoji, label: meta.label };
  });
}

export { pickCard };

function normalizeSize(value) {
  const n = Number(value);
  return SIZES.includes(n) ? n : 24;
}

/** 结束这一局：写 winner / 撒娇卡，并把胜场累加到 room.stats。 */
function win(d, seat, now, room) {
  d.phase = "over";
  d.winner = seat;
  d.endedAt = now ?? Date.now();
  d.event = null;
  d.closing = { forSeat: otherSeat(seat), text: pickCard(closingCards) };
  if (room) {
    const wins = gameWins(room, ID);
    wins[seat]++;
    d.wins = [...wins];
  }
}

function endTurn(d) {
  d.event = null;
  d.phase = "roll";
  d.turn = otherSeat(d.turn);
  if (d.turn === 0) d.round++;
}

/**
 * 记录一次「可见位移」，只给客户端做飞行动画用，不参与任何胜负/回合判定。
 * from / to 都带两个人的位置，交换位置时两条航线可以同时补间。
 * 旧版本存档没有这个字段，客户端会退回比较 pos 的变化。
 */
function recordMove(d, before, source, kind, seat, now) {
  d.moveSeq = (d.moveSeq || 0) + 1;
  d.lastMove = {
    id: d.moveSeq,
    source,
    seat,
    kind,
    from: [before[0], before[1]],
    to: [d.pos[0], d.pos[1]],
    at: now ?? Date.now()
  };
}

/**
 * 掷骰子的纯推进（不含随机数）：把 value 应用到 seat 的棋子上。
 * action 内部调用它；单测可以直接调，用 room 参数检查胜场是否累加。
 */
export function applyDice(d, seat, value, now = Date.now(), room = null) {
  if (!d || (seat !== 0 && seat !== 1)) return null;
  const roll = Math.max(1, Math.min(6, Math.round(Number(value)) || 1));
  const before = [d.pos[0], d.pos[1]];
  const from = d.pos[seat];
  const to = Math.min(from + roll, d.length - 1);
  const kind = d.board[to]?.kind || "plain";

  d.dice = roll;
  d.pos[seat] = to;
  d.rolls[seat]++;
  d.history.push({ seat, roll, from, to, kind });
  recordMove(d, before, "roll", kind, seat, now);

  if (to === d.length - 1) {
    win(d, seat, now, room);
    return null;
  }

  if (kind === "truth" || kind === "task") {
    d.event = {
      kind,
      title: `${KIND_META[kind].emoji} ${KIND_META[kind].label}`,
      text: pickCard(kind === "truth" ? truthCards : taskCards)
    };
    d.phase = "event";
    return null;
  }

  if (kind === "forward" || kind === "back" || kind === "swap" || kind === "again") {
    const delta = kind === "forward" ? 2 : kind === "back" ? -2 : 0;
    d.event = {
      kind,
      title: `${KIND_META[kind].emoji} ${KIND_META[kind].label}`,
      text: EVENT_TEXT[kind],
      delta
    };
    d.phase = "event";
    return null;
  }

  // plain（或理论上不会出现的 start / finish）
  endTurn(d);
  return null;
}

/** 处理事件卡，返回 null 或中文错误。 */
function resolveEvent(room, d, seat, now) {
  if (d.phase !== "event") return "现在没有要处理的卡";
  if (!d.event) return "这张卡已经处理过了";
  if (d.turn !== seat) return "等 TA 处理这张卡";

  const ev = d.event;
  // 每一张被处理掉的事件卡都算一次「路上遇到的事件」。
  d.events++;

  if (ev.kind === "again") {
    // 同一个回合再来一次：turn 不变，回到掷骰子。
    d.event = null;
    d.phase = "roll";
    return null;
  }

  if (ev.kind === "forward") {
    const before = [d.pos[0], d.pos[1]];
    const to = Math.min(d.pos[seat] + 2, d.length - 1);
    d.pos[seat] = to;
    recordMove(d, before, "event", ev.kind, seat, now);
    d.event = null;
    if (to === d.length - 1) {
      win(d, seat, now, room);
      return null;
    }
    endTurn(d);
    return null;
  }

  if (ev.kind === "back") {
    const before = [d.pos[0], d.pos[1]];
    d.pos[seat] = Math.max(0, d.pos[seat] - 2);
    recordMove(d, before, "event", ev.kind, seat, now);
    endTurn(d);
    return null;
  }

  if (ev.kind === "swap") {
    const before = [d.pos[0], d.pos[1]];
    const mine = d.pos[seat];
    const theirs = d.pos[otherSeat(seat)];
    d.pos[seat] = theirs;
    d.pos[otherSeat(seat)] = mine;
    recordMove(d, before, "event", ev.kind, seat, now);
    endTurn(d);
    return null;
  }

  // truth / task：说 / 做完就换人。
  endTurn(d);
  return null;
}

export default {
  create(room) {
    const s = room.settings?.[ID] || {};
    const length = normalizeSize(s.tiles);
    const wins = gameWins(room, ID);
    return {
      phase: "roll",
      turn: 0,
      round: 1,
      length,
      board: makeBoard(length),
      pos: [0, 0],
      dice: null,
      event: null,
      winner: null,
      closing: null,
      history: [],
      moveSeq: 0,
      lastMove: null,
      rolls: [0, 0],
      events: 0,
      startedAt: Date.now(),
      endedAt: null,
      wins: [...wins]
    };
  },

  action(room, seat, action, now = Date.now()) {
    const d = room?.game?.data;
    if (!d) return "这一局还没开始";
    if (d.phase === "over") return "这一局已经结束啦";

    if (action?.type === "roll") {
      if (d.turn !== seat) return "还没轮到你";
      if (d.phase === "event") return "先处理这张卡";
      if (d.phase !== "roll") return "现在还不能掷骰子";
      const value = 1 + Math.floor(Math.random() * 6);
      applyDice(d, seat, value, now, room);
      return null;
    }

    if (action?.type === "resolve") {
      return resolveEvent(room, d, seat, now);
    }

    return "这个操作暂时不可以";
  },

  tick() {
    // 纯回合制，没有倒计时。
    return false;
  },

  summary(room) {
    const d = room.game.data;
    const winner = d.winner;
    const name = winner === 0 || winner === 1 ? room.seats[winner]?.profile?.nickname || "TA" : "TA";
    const rolls = winner === 0 || winner === 1 ? d.rolls[winner] : 0;
    const closing = d.closing || { forSeat: winner === 0 || winner === 1 ? otherSeat(winner) : 1, text: "" };
    return {
      title: "爱情飞行棋",
      detail: `${name} 先到终点 · 掷了 ${rolls} 次骰子，路上遇到 ${d.events} 个心动事件`,
      data: { winner, rolls: d.rolls, events: d.events, closing }
    };
  }
};
