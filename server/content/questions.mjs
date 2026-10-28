// 「你懂我吗」题库。type: choice | scale | text
export const questions = [
  // 吃喝
  {
    id: "e1",
    category: "吃喝",
    type: "choice",
    text: "如果只能选一样当夜宵，{name} 会选？",
    options: ["烧烤", "泡面", "炸鸡", "水果"],
  },
  {
    id: "e2",
    category: "吃喝",
    type: "text",
    text: "{name} 最近吃过的东西里，最喜欢哪一样？",
  },
  {
    id: "e3",
    category: "吃喝",
    type: "choice",
    text: "{name} 吃火锅时的必点菜是？",
    options: ["毛肚", "虾滑", "土豆", "肥牛"],
  },
  {
    id: "e4",
    category: "吃喝",
    type: "scale",
    text: "{name} 有多爱喝奶茶？",
    left: "完全不喝",
    right: "一天一杯",
  },
  {
    id: "e5",
    category: "吃喝",
    type: "text",
    text: "如果明天有人下厨，{name} 最想吃什么？",
  },

  // 习惯
  {
    id: "h1",
    category: "习惯",
    type: "choice",
    text: "{name} 早上起床后第一件事通常是？",
    options: ["看手机", "喝水", "洗脸", "继续赖床"],
  },
  {
    id: "h2",
    category: "习惯",
    type: "scale",
    text: "{name} 有多怕冷？",
    left: "冬天也穿很少",
    right: "夏天也要盖被子",
  },
  {
    id: "h3",
    category: "习惯",
    type: "choice",
    text: "{name} 出门前最后检查的是？",
    options: ["手机", "钥匙", "钱包", "镜子里的自己"],
  },
  {
    id: "h4",
    category: "习惯",
    type: "text",
    text: "{name} 有什么小习惯，是另一半一开始不习惯、后来也习惯了的？",
  },
  {
    id: "h5",
    category: "习惯",
    type: "choice",
    text: "{name} 睡觉时更喜欢？",
    options: ["抱着人", "抱着被子", "四仰八叉", "蜷成一团"],
  },

  // 回忆
  {
    id: "m1",
    category: "回忆",
    type: "text",
    text: "{name} 还记得我们第一次一起吃饭吃了什么吗？",
  },
  {
    id: "m2",
    category: "回忆",
    type: "text",
    text: "我们之间，{name} 最常想起来的一个瞬间是？",
  },
  {
    id: "m3",
    category: "回忆",
    type: "choice",
    text: "我们第一次约会，{name} 当时最紧张的是？",
    options: ["迟到", "没话说", "穿得不好看", "对方喜不喜欢我"],
  },
  {
    id: "m4",
    category: "回忆",
    type: "text",
    text: "有没有一件关于另一半的小事，{name} 一直记得？",
  },
  {
    id: "m5",
    category: "回忆",
    type: "scale",
    text: "{name} 给我们的初遇打几分？",
    left: "想重来",
    right: "命中注定",
  },

  // 恋爱
  {
    id: "a1",
    category: "恋爱",
    type: "choice",
    text: "{name} 最想收到哪种惊喜？",
    options: ["一束花", "一顿饭", "一个小礼物", "突然的拥抱"],
  },
  {
    id: "a2",
    category: "恋爱",
    type: "text",
    text: "另一半做什么会让 {name} 觉得自己被偏爱？",
  },
  {
    id: "a3",
    category: "恋爱",
    type: "scale",
    text: "{name} 有多喜欢和另一半待在一起发呆？",
    left: "有点浪费",
    right: "可以一整天",
  },
  {
    id: "a4",
    category: "恋爱",
    type: "choice",
    text: "{name} 觉得我们最像哪种情侣？",
    options: ["欢喜冤家", "老夫老妻", "热恋期", "最佳搭子"],
  },
  {
    id: "a5",
    category: "恋爱",
    type: "text",
    text: "如果要用一首歌形容我们，{name} 会选哪首？为什么？",
  },

  // 假如
  {
    id: "i1",
    category: "假如",
    type: "choice",
    text: "如果明天醒来会瞬移到一座城市，{name} 选？",
    options: ["海边小城", "雪山脚下", "热闹都市", "无人小岛"],
  },
  {
    id: "i2",
    category: "假如",
    type: "text",
    text: "{name} 有一项超能力，只能用来帮另一半，会选什么？",
  },
  {
    id: "i3",
    category: "假如",
    type: "choice",
    text: "如果我们可以变成两只动物一起生活，{name} 想当？",
    options: ["猫", "狗", "兔子", "企鹅"],
  },
  {
    id: "i4",
    category: "假如",
    type: "scale",
    text: "{name} 有多想和另一半一起辞职去旅行？",
    left: "再想想",
    right: "现在就走",
  },
  {
    id: "i5",
    category: "假如",
    type: "text",
    text: "假如回到我们认识的前一天，{name} 想对另一半说什么？",
  },

  // 未来
  {
    id: "f1",
    category: "未来",
    type: "text",
    text: "{name} 希望三年后的我们，正在过着什么样的日子？",
  },
  {
    id: "f2",
    category: "未来",
    type: "choice",
    text: "{name} 想和另一半先完成哪一件事？",
    options: ["一起旅行", "一起养宠物", "一起存钱", "一起学一样东西"],
  },
  {
    id: "f3",
    category: "未来",
    type: "scale",
    text: "{name} 对我们的未来有多笃定？",
    left: "走一步看一步",
    right: "一直是你",
  },
  {
    id: "f4",
    category: "未来",
    type: "text",
    text: "有哪一个小目标，{name} 想和另一半一起在今年完成？",
  },
  {
    id: "f5",
    category: "未来",
    type: "choice",
    text: "{name} 希望我们老了以后住在？",
    options: ["有院子的房子", "海边", "热闹的市区", "跟着孩子走"],
  },
];
