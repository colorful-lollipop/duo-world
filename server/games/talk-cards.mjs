import { cardsForDeck } from "./_talk-cards.deck.mjs";

function pickCard(data) {
  const pool = cardsForDeck(data.deck);
  let available = pool.filter((c) => !data.used.includes(c.id));
  if (!available.length) {
    data.used = [];
    available = pool;
  }
  return available[Math.floor(Math.random() * available.length)];
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
    if (action?.type === "finish") {
      d.phase = "over";
      return null;
    }
    return "这个操作暂时不可以";
  },

  summary(room) {
    const d = room.game.data;
    const favs = d.favorites[0].length + d.favorites[1].length;
    return {
      title: "深夜聊天卡",
      detail: `一起翻开了 ${d.shownCount} 张卡${favs ? `，收藏了 ${favs} 张` : ""}`,
    };
  },
};
