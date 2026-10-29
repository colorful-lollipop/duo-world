// 爱情飞行棋专属题库与棋盘布局。
// 下划线开头，自动发现器会跳过它，只会被 server/games/love-flight.mjs import。

/** 三种固定路线。写死是为了让节奏可控（起点 → 事件 → 终点），而不是每次随机生成。 */
export const LAYOUTS = {
  18: ["start","plain","truth","plain","forward","plain","task","back","plain","truth","swap","plain","task","again","plain","truth","forward","finish"],
  24: ["start","plain","truth","plain","forward","plain","task","plain","back","plain","truth","swap","plain","task","plain","again","truth","plain","forward","plain","task","back","plain","finish"],
  30: ["start","plain","truth","plain","forward","plain","task","plain","back","plain","truth","plain","swap","plain","task","plain","again","plain","truth","plain","forward","plain","task","plain","back","plain","truth","plain","task","finish"]
};

/** 每种格子的展示信息。服务端下发到 board 里，客户端直接渲染。 */
export const KIND_META = {
  start: { emoji: "🏁", label: "起点" },
  plain: { emoji: "·", label: "继续走" },
  finish: { emoji: "💗", label: "终点" },
  truth: { emoji: "💬", label: "真心话" },
  task: { emoji: "🎯", label: "小任务" },
  forward: { emoji: "⏩", label: "顺风一程" },
  back: { emoji: "⏪", label: "小插曲" },
  swap: { emoji: "🔁", label: "换个位置" },
  again: { emoji: "🎲", label: "再来一次" }
};

/** 真心话：轻松、具体、不越界，适合两个人当场聊。 */
export const truthCards = [
  "第一次见面时，你最先注意到 TA 的什么？",
  "最近一次觉得 TA 很可爱是什么时候？",
  "如果明天放假，你最想和 TA 去哪？",
  "TA 做过的哪件小事让你偷偷开心了很久？",
  "你更喜欢 TA 笑起来的样子，还是认真做事的样子？",
  "如果要给 TA 起一个只有你们懂的绰号，会叫什么？",
  "你手机里最喜欢的一张合照是哪一张？",
  "你希望十年后的周末，你们在做什么？",
  "最近一次想对 TA 说谢谢，是因为什么？",
  "你觉得自己在 TA 面前最放松的时刻是什么时候？",
  "如果只能保留一个和 TA 的回忆，你会选哪一个？",
  "TA 的哪个习惯已经被你悄悄学过来了？",
  "你最想和 TA 一起完成的一件小事是什么？",
  "你有没有偷偷保存过 TA 发来的哪句话？",
  "你们闹别扭之后，你最想听到 TA 说什么？",
  "你第一次觉得「这个人不错」是在哪一刻？",
  "如果给你们的相处打一个温度，现在是几度？为什么？",
  "你最想被 TA 夸哪一点？",
  "你觉得 TA 最不了解你的哪一面？",
  "最近一次心动是因为什么？",
  "你最喜欢和 TA 一起做的家务是哪一件？",
  "如果能和 TA 交换一天身份，你最想体验什么？",
  "你觉得你们两个人最像的地方是什么？",
  "TA 说过的哪句话让你觉得被理解了？",
  "你希望 TA 多陪你做什么？",
  "你们之间有什么只有两个人懂的小暗号？",
  "你最近有没有一件想分享却忘了说的事？",
  "如果现在可以许一个和 TA 有关的小愿望，会是什么？",
  "你觉得 TA 身上最让你安心的地方是哪里？",
  "你最喜欢 TA 的哪个小表情？",
  "下次见面，你想先做什么？",
  "你有没有因为 TA 改变过一个小习惯？"
];

/** 小任务：当场能做或一句话能答，不要求出门、不买东西。 */
export const taskCards = [
  "夸 TA 三个优点，不能重复",
  "说出你们第一次约会的地点",
  "给对方一个 10 秒的拥抱",
  "学一句 TA 的口头禅",
  "用三个词形容现在的 TA",
  "说出 TA 最喜欢吃的一样东西",
  "模仿 TA 生气时的样子，坚持三秒",
  "给 TA 唱两句你们一起听过的歌",
  "说出 TA 今天穿的是什么颜色的衣服",
  "用一句话把 TA 逗笑",
  "说出 TA 最近最想做的一件事",
  "用手给 TA 比一个爱心",
  "说一件你最近为 TA 做的小事",
  "用「因为……所以……」造一句夸 TA 的话",
  "猜一猜 TA 现在的心情，猜错就再猜一次",
  "说出你们聊天里最常出现的一个表情",
  "给 TA 一个只有你们懂的称呼，并叫一遍",
  "说出 TA 身上你最喜欢的一个味道",
  "和 TA 击掌三次，一次比一次响",
  "用三个字总结你对 TA 的第一印象",
  "说出你们最近一次一起笑到停不下来的原因",
  "给 TA 一个三秒钟的额头贴贴"
];

/** 撒娇卡：输家抽一张，轻松、可兑现、不尴尬。 */
export const closingCards = [
  "给 TA 捏肩 3 分钟",
  "下次约会由你定地点",
  "明天第一条消息由你先发",
  "夸 TA 三句，不能重复",
  "给 TA 倒一杯水端到手边",
  "这周的家务你多包一件",
  "陪 TA 看一集 TA 想看的剧",
  "给 TA 讲一个睡前故事，三句话就够",
  "下次见面先给 TA 一个拥抱",
  "给 TA 发一条 30 字以上的夸奖",
  "这周末负责一次早餐",
  "陪 TA 散步 20 分钟，不看手机",
  "给 TA 唱一首歌的副歌部分",
  "让 TA 点一首歌，你负责哼",
  "下次闹别扭你先递台阶",
  "给 TA 拍一张好看的照片并设成聊天背景"
];

/** 从卡组里抽一张；random 参数方便单测注入固定随机数。 */
export function pickCard(list, random = Math.random) {
  if (!Array.isArray(list) || list.length === 0) return "";
  const i = Math.floor(Math.max(0, Math.min(0.999999, random())) * list.length);
  return list[i];
}
