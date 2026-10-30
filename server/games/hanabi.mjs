// 双人经典花火。规则参考 Hanab.cards (MIT)，见 docs/games/hanabi.md。
import { randomUUID, randomInt } from "node:crypto";
const COLORS = ["red", "yellow", "green", "blue", "white"];
const RANKS = [1, 2, 3, 4, 5];
const NAMES = { red: "红", yellow: "黄", green: "绿", blue: "蓝", white: "白" };
const face = (c) => ({ color: c.color, rank: c.rank });
const knowledge = (c) => ({ colors: [...c.knowledge.colors], ranks: [...c.knowledge.ranks] });
function draw(d, seat) {
  const card = d.deck.pop();
  if (card) d.hands[seat].push({ ...card, id: randomUUID(), knowledge: { colors: [...COLORS], ranks: [...RANKS] } });
}
function log(d, message) { d.log.push(message); d.log = d.log.slice(-20); }
export default {
  create() {
    const deck = COLORS.flatMap(color => RANKS.flatMap(rank => Array.from({ length: [0, 3, 2, 2, 2, 1][rank] }, () => ({ color, rank }))));
    for (let i = deck.length - 1; i > 0; i--) { const j = randomInt(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const d = { phase: "playing", turn: 0, turnNumber: 0, hints: 8, fuses: 3, fireworks: Object.fromEntries(COLORS.map(c => [c, 0])), deck, hands: [[], []], discard: [], log: [], score: 0, finalTurns: null, endReason: null };
    for (let n = 0; n < 5; n++) { draw(d, 0); draw(d, 1); }
    return d;
  },
  action(room, seat, action) {
    const d = room.game.data;
    if (seat !== 0 && seat !== 1) return "座位不正确";
    if (d.phase !== "playing") return "这场烟花已结束，再来一局吧";
    if (!action || action.run !== room.game.run || action.turnNumber !== d.turnNumber) return "回合已经变化，请按最新牌面操作";
    if (seat !== d.turn) return "请等伙伴完成这一回合";
    if (!room.seats.every(s => s?.ws?.readyState === 1)) return "等两个人都连接后再继续吧";
    const wasFinal = d.finalTurns !== null;
    const who = seat === 0 ? "房主" : "伙伴";
    if (action.type === "hint") {
      if (action.target !== undefined && action.target !== 1 - seat) return "只能提示伙伴";
      if (d.hints < 1) return "提示用完了，先弃牌恢复一个吧";
      const kind = action.kind;
      if ((kind !== "color" && kind !== "rank") || !(kind === "color" ? COLORS : RANKS).includes(action.value)) return "请选择有效的颜色或数字提示";
      const hand = d.hands[1 - seat];
      if (!hand.some(c => c[kind] === action.value)) return "伙伴手中没有符合这个提示的牌";
      const key = kind === "color" ? "colors" : "ranks";
      for (const c of hand) c.knowledge[key] = c[kind] === action.value ? [action.value] : c.knowledge[key].filter(v => v !== action.value);
      d.hints--;
      log(d, `${who}提示：伙伴手中所有${kind === "color" ? NAMES[action.value] + "色" : "数字 " + action.value}的牌。`);
    } else if (action.type === "play" || action.type === "discard") {
      if (typeof action.cardId !== "string") return "请先选一张自己的牌";
      const index = d.hands[seat].findIndex(c => c.id === action.cardId);
      if (index < 0) return "这张牌已经不在手中了，请重新选择";
      if (action.type === "discard" && d.hints === 8) return "提示已满，不能弃牌；试试给伙伴提示";
      const [card] = d.hands[seat].splice(index, 1);
      const label = `${NAMES[card.color]}色 ${card.rank}`;
      if (action.type === "discard") { d.discard.push(face(card)); d.hints++; log(d, `${who}弃掉${label}，恢复一个提示。`); }
      else if (d.fireworks[card.color] + 1 === card.rank) {
        d.fireworks[card.color]++; d.score++;
        const restored = card.rank === 5 && d.hints < 8;
        if (card.rank === 5) d.hints = Math.min(8, d.hints + 1);
        log(d, `${who}成功点亮${label}${card.rank === 5 ? (restored ? "，完成一色烟花并恢复一个提示" : "，完成一色烟花") : ""}！`);
      } else { d.discard.push(face(card)); d.fuses--; log(d, `${who}打出${label}，顺序不符，消耗一根引线。`); }
      // 终局不再补牌；否则抽走最后一张后，双方各有一个完整回合。
      if (d.fuses > 0 && d.score < 25 && d.deck.length) {
        draw(d, seat);
        if (!d.deck.length) d.finalTurns = 2;
      }
    } else return "这个操作暂时不可以";
    d.turnNumber++;
    if (wasFinal) d.finalTurns--;
    if (d.fuses === 0 || d.score === 25 || d.finalTurns === 0) {
      d.phase = "over";
      d.endReason = d.fuses === 0 ? "引线耗尽，挑战失败" : d.score === 25 ? "完美烟花" : "最后一轮结束";
      log(d, `${d.endReason}，一起点亮了 ${d.score} / 25 分的烟花。`);
    } else d.turn = 1 - seat;
    return null;
  },
  view(d, seat) {
    // 明确白名单：未出手的牌堆、自己的牌面和未来新增私有字段永远不上网。
    return {
      phase: d.phase, turn: d.turn, turnNumber: d.turnNumber, hints: d.hints, fuses: d.fuses,
      fireworks: { ...d.fireworks }, deckCount: d.deck.length, finalTurns: d.finalTurns,
      hands: d.hands.map((hand, owner) => hand.map(c => ({ id: c.id, knowledge: knowledge(c), ...(owner !== seat && (seat === 0 || seat === 1) ? face(c) : {}) }))),
      discard: d.discard.map(face), log: [...d.log], score: d.score, endReason: d.endReason,
    };
  },
  summary(room) {
    const d = room.game.data;
    return { title: "默契花火", detail: `两个人一起点亮 ${d.score} / 25 分的烟花 · ${d.endReason}`, data: { score: d.score, fireworks: { ...d.fireworks }, endReason: d.endReason, turns: d.turnNumber } };
  },
};
