// 模板：新游戏的服务端规则。
// 复制成 server/games/<id>.mjs 就会被自动加载（文件名 = 游戏 id），
// 同时要在 shared/games.json 里登记元数据，并在 src/games/<id>.tsx 放界面。
//
// 约定：默认导出 { create, action }（必填），tick / summary（可选）。
// - create(room)     返回可 JSON 序列化的 game.data
// - action(...)      修改 room.game.data；返回 null 表示成功，返回字符串会作为错误提示
// - tick(room, now)  有倒计时/自动推进时实现，返回 true 表示状态变了
// - summary(room)    结束（data.phase === "over"）后写进纪念册
import { gameWins, otherSeat } from "./_kit.mjs";

export default {
  create(room) {
    const s = room.settings["your-game-id"] || {};
    const wins = gameWins(room, "your-game-id");
    return {
      phase: "playing",
      round: 0,
      rounds: Number(s.rounds) || 5,
      score: 0,
      wins: [...wins],
      // ...你的初始状态
    };
  },

  action(room, seat, action, now) {
    const d = room.game.data;
    if (action?.type === "tap") {
      if (d.phase !== "playing") return "这一局已经结束啦";
      d.round++;
      d.score++;
      if (d.round >= d.rounds) d.phase = "over";
      return null;
    }
    return "这个操作暂时不可以";
  },

  tick(room, now) {
    // const d = room.game.data;
    // if (d.phase === "playing" && now >= d.deadline) { d.phase = "over"; return true; }
    return false;
  },

  summary(room) {
    const d = room.game.data;
    return {
      title: "我的新游戏",
      detail: `一起拿到了 ${d.score} 分`,
      data: { score: d.score },
    };
  },
};
