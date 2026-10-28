import { cardsForDeck } from "./_talk-cards.deck.mjs";

const SAY_MAX = 120;
const SAY_GAP = 250;
const SAY_KEEP = 60;

function pickCard(data) {
  const pool = cardsForDeck(data.deck);
  let available = pool.filter((c) => !data.used.includes(c.id));
  if (!available.length) {
    data.used = [];
    available = pool;
  }
  return available[Math.floor(Math.random() * available.length)];
}

/** 聊天文本归一化：trim + 按字符（而非 UTF-16 单元）截到 120 字；空文本返回 null。 */
function normalizeSay(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const chars = Array.from(text);
  return chars.length > SAY_MAX ? chars.slice(0, SAY_MAX).join("") : text;
}

export default {
  create(room) {
    const deck = room.settings["talk-cards"]?.deck || "走心";
    return {
      deck,
      idx: 0,
      turn: Math.random() < 0.5 ? 0 : 1,
      phase: "draw",
      card: null,
      flipAt: 0,
      used: [],
      shownCount: 0,
      favorites: [[], []],
      hint: "",
      messages: [],
      msgSeq: 0,
      lastSay: [0, 0],
    };
  },

  action(room, seat, action, now) {
    const d = room.game.data;
    if (action?.type === "draw") {
      if (d.phase !== "draw") return "这张卡已经翻开啦";
      if (d.turn !== seat) return "轮到 TA 抽卡啦";
      const card = pickCard(d);
      d.card = { id: card.id, deck: card.deck, text: card.text };
      d.used.push(card.id);
      d.phase = "shown";
      d.flipAt = now + 900;
      d.shownCount++;
      return null;
    }
    if (action?.type === "reroll") {
      if (d.phase !== "shown") return "先抽一张卡吧";
      if (d.turn !== seat) return "轮到 TA 啦";
      const card = pickCard(d);
      d.card = { id: card.id, deck: card.deck, text: card.text };
      d.used.push(card.id);
      d.phase = "shown";
      d.flipAt = now + 900;
      d.idx++;
      d.shownCount++;
      return null;
    }
    if (action?.type === "next") {
      if (d.phase !== "shown") return "先抽一张卡吧";
      d.turn = 1 - d.turn;
      d.idx++;
      d.phase = "draw";
      d.card = null;
      d.flipAt = 0;
      return null;
    }
    if (action?.type === "fav") {
      if (!d.card) return "还没有可以收藏的卡";
      const list = d.favorites[seat];
      const exists = list.findIndex((c) => c.id === d.card.id);
      if (exists >= 0) list.splice(exists, 1);
      else list.push(d.card);
      return null;
    }
    if (action?.type === "say") {
      if (d.phase === "over") return "这一局已经聊完啦";
      // 兼容上线前就在内存 / sqlite 里的旧房间
      if (!Array.isArray(d.messages)) d.messages = [];
      if (!Array.isArray(d.lastSay)) d.lastSay = [0, 0];
      if (typeof d.msgSeq !== "number") d.msgSeq = 0;
      if (now - (d.lastSay[seat] || 0) < SAY_GAP) return "说慢一点嘛，刚才那句我还没看完";
      const text = normalizeSay(action.text);
      if (text === null) return "想说点什么呢，不能发空消息";
      d.messages.push({ id: String(++d.msgSeq), seat, text, at: now });
      if (d.messages.length > SAY_KEEP) d.messages.splice(0, d.messages.length - SAY_KEEP);
      d.lastSay[seat] = now;
      return null;
    }
    if (action?.type === "finish") {
      d.phase = "over";
      return null;
    }
    return "这个操作暂时不可以";
  },

  summary(room) {
    const d = room.game.data;
    const favs = d.favorites[0].length + d.favorites[1].length;
    const chat = d.messages?.length || 0;
    return {
      title: "深夜聊天卡",
      detail: `一起翻开了 ${d.shownCount} 张卡${favs ? `，收藏了 ${favs} 张` : ""}${chat ? `，聊了 ${chat} 句` : ""}`,
    };
  },
};
