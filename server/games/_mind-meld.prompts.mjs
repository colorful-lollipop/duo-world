// 心有灵犀 · 灵感词库（供界面上的「没灵感？点一个词」使用）
// 只和这款游戏有关；改这里不会影响别的游戏。
export const prompts = [
  "海", "猫", "雨", "灯", "风", "树", "光", "路", "糖", "云",
  "回家", "拥抱", "夏天", "凌晨", "火车", "厨房", "星星", "沙发", "旅行", "秘密",
  "第一次", "晚安", "小时候", "窗外", "远方", "慢", "暖", "吵", "等", "想念",
  "咖啡", "散步", "月亮", "雨天", "生日", "照片", "一起", "安静", "勇敢", "温柔",
  "冰箱", "老歌", "晚霞", "枕头", "雨天", "钥匙", "花", "纸", "影子", "烟火",
];

/** 排除已经出现过的词，随机抽 count 个灵感词。 */
export function pickPrompts(history, count = 6, random = Math.random) {
  const used = new Set();
  for (const h of history || []) {
    used.add(String(h.a || "").toLowerCase());
    used.add(String(h.b || "").toLowerCase());
  }
  const pool = prompts.filter((p) => !used.has(p.toLowerCase()));
  const source = pool.length >= count ? pool : prompts.slice();
  const shuffled = source.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}
