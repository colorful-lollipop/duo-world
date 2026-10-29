# 哥俩好（`brothers`）

两只猴子被一根绳子拴在一起，一起往前闯断桥。**双方各自实时控制自己的猴子**（没有回合）：按住蓄力，松开起跳；掉下去会挂在绳子上，同伴会被绳子慢慢拖过去，**快速连点救援按钮**才能把她拉上来。路上还能捡金币，两个人都到终点才算赢。

## 文件

| 作用 | 路径 |
| --- | --- |
| 元数据 / 设置 | `shared/games/brothers.json` |
| 服务端规则 | `server/games/brothers.mjs` |
| 客户端 | `src/games/brothers.tsx` |
| 样式 | `src/games/brothers.css` |
| 单测 | `tests/unit/brothers.test.mjs` |
| 端到端 | `scripts/smoke/brothers.mjs` |

## 玩法

1. **实时**：没有 `turn` 字段，两个座位随时可以跳，互不等待；每个座位自己的冷却时间独立。
2. **蓄力**：`hold` 毫秒映射到 `jumpMin..jumpMax`，轻点是小跳（36），满蓄力是 300；服务端把 `hold` 夹到 `0..chargeMs`。客户端只显示蓄力条，不显示百分比数字。
3. **绳子有最大长度 `rope=300`**：
   - 不管两个人都在平台上，还是有人挂着，服务端都会把两人的水平距离限制在 `rope` 内；跳跃落点超出时会被绳子拽回。
   - 一个人掉下去后 `alive=false`（挂在绳子上），不能自己跳；**另一个人会被绳子慢慢往挂着的人那边拖**（`dragSpeed=13px/s`，只在当前平台内移动，不会直接被拖下坑）。
   - 挂着的猴子会被吊在绳子最大长度内，位置也受同伴移动影响；同伴大跳后如果超过绳长，会按 `ropePullSpeed=420px/s` 平滑拉回，不会瞬移。
4. **快速连点救援**：
   - 站着的人（包括已经到终点的人）点击「快速点我 · 拉 TA 上来」，每点一下增加 `reelTapGain=14%` 卷绳进度，进度显示在按钮和状态栏里。
   - 停手超过 `reelGraceMs=900ms` 后，进度会按 `reelDecayPerSec=9%/s` 回落；所以必须**连续快点**。
   - 进度到 100% 才真正把人放到自己所在的平台上，`rescued++`、`pulls++`，并播放 `lastPull` 补间。
5. **金币**：
   - 每块非尖刺平台会生成 1~2 枚金币（`makeCoins`，同 seed 确定）；第一块出生平台和尖刺平台没有。
   - 谁先落到这块平台，谁就收走这块平台上还没被拿走的金币；`coinsGot` 是全队共享计数，`mon[].coins` 是个人计数。
   - HUD 显示 `已收集 / 总数`，结算页和纪念册也会记录。
6. **终点**：每人各自到终点记 `finished`，**两个人都 finished** 才 `finish`；跳过头（`to >= finishX`）也算冲线，不会判掉坑。先到的人可以等/拉同伴，但不能再跳。
7. **结束**：`finish`（两人都到）/ `both-fall`（两人都挂）/ `time`（超时）。

## 数值（全部由 `d.tuning` 下发给客户端）

| 字段 | 值 | 含义 |
| --- | --- | --- |
| `jumpMin` | 36 | `hold=0` 的跳跃距离 |
| `jumpMax` | 300 | 满蓄力距离 |
| `chargeMs` | 1400 | 蓄满需要按多久 |
| `cooldownMs` | 260 | 每次跳后的个人冷却 |
| `jumpMs` | 520 | 跳跃补间时长（动画） |
| `pullMs` | 420 | 救援完成后的拉人补间时长（动画） |
| `finishBonus` | 40 | 冲线额外余量，避免跳过头判掉坑 |
| `reelTapGain` | 14 | 每点一下增加的救援进度（%） |
| `reelDecayPerSec` | 9 | 停手后救援进度每秒回落（%） |
| `reelGraceMs` | 900 | 停手多久后开始回落 |
| `dragSpeed` | 13 | 一个人挂着时，另一个人被拖动的速度（px/s） |
| `dragMinDist` | 120 | 距离超过多少才开始拖 |
| `ropePullSpeed` | 420 | 被绳子拉回时的最大速度（px/s），用于补间而不是瞬移 |
| `d.rope` | 300 | 绳子最大长度（水平约束） |

客户端不要重复写死这些数值；蓄力条、跳跃补间、救援进度和冷却显示都直接读 `d.tuning`。

## 数据形状

```js
{
  seed, count, spikes, platforms: [{x,w,y,spike}], finishX, baseY, rope,
  tuning: { jumpMin, jumpMax, chargeMs, cooldownMs, jumpMs, pullMs, finishBonus,
            reelTapGain, reelDecayPerSec, reelGraceMs, dragSpeed, dragMinDist },
  mon: [{ x, y, alive, finished, cooldownUntil, lastJumpAt, coins }],
  phase,                    // playing | over
  overReason,               // finish | both-fall | time
  startedAt, endedAt, deadline, timeLimit,
  lastJump: [null, null],   // { seat, from, to, rawTo, ropePulled, fromY, toY, startedAt, ms, result: "land"|"hang"|"finish" }
  lastPull: [null, null],   // { seat, fromX, fromY, toX, toY, startedAt, ms }（seat=拉人者）
  reel: [0, 0],             // 每个座位作为「被救者」时的卷绳进度 0..100
  reelAt: [0, 0],           // 最近一次点击时间，用于回落
  lastReel: null,           // { seat, at, progress }
  coins: [{ id, platform, x, y, taken }], // taken=null | 0 | 1
  coinTotal, coinsGot, lastCoin: null | { seat, amount, at },
  lastTickAt, jumps, falls, rescued, pulls, distance,
}
```

- `mon[].y` 是平台高度；挂着时客户端把脚画在 `y - HANG_DROP`，绳子挂点在 `y`。
- `lastJump` 按座位各存一份，两个人可以同时处于跳跃补间。
- `lastPull[pullerSeat]` 由被拉的人播动画（客户端取 `lastPull[1 - mySeat]`）。
- `reel[seat]` 只对「挂着的人」有意义；救援完成后清零。
- `distance` 只记落到平台/被拉到的位置，用于 HUD 和结算米数。

## 动作

- `jump { hold }`：`hold` 毫秒（`0..chargeMs`，服务端夹紧；非数字拒绝）。要求自己 `alive && !finished` 且 `now >= cooldownUntil`，否则返回中文字符串错误。
- `pull`：快速连点救援。要求自己 `alive`、同伴 `!alive`；每点一次 `reel[mateSeat] += reelTapGain`，满 100 才把同伴放到自己平台上并记 `rescued/pulls`。没有冷却，但停手会回落。

服务端所有落点/绳长/金币/结束判定都在 `server/games/brothers.mjs`，客户端只发动作、渲染快照（`lastJump` / `lastPull` 做插值，自己起跳有本地预测）。

两人同时起跳时：服务端在同一个 I/O 轮询里收到的多个 `jump` 会合并成一轮 `state` 广播（`server/rooms.mjs` 的 `broadcastState`）；客户端 `useRoom` 对哥俩好的连续 `state` 再合并到下一帧，避免两次完整渲染叠在一起造成卡顿。

## 关卡与金币生成

- `makeLevel(seed, count, spikes)` 仍然是纯函数、同 seed 完全一致；返回 `{ platforms, finishX, coins }`。
- `platformAt(platforms, x)` 保留导出，测试会直接用。
- 尖刺只会出现在 `4 <= i < count-1` 的平台，最后一块（终点）永远没有尖刺；尖刺平台不会连续出现，宽度被压到 62–82，前后坑都收窄到 ≤80，保证满蓄力能直接跳过整块尖刺平台，不会出现死局。
- `makeCoins(platforms, rng)` 给每块普通平台放 1~2 枚金币；金币的 `platform` 是平台下标，落地收集时按这个下标找。
- 平台最大 gap 约为 190，`jumpMax=300` 足够；但绳子有 300 的最大长度，跳之前别把同伴甩得太远。

## 客户端实现要点

- 在 `.brothers-world` 上 pointerdown 开始蓄力、pointerup/pointercancel（以及 window 上的 pointerup/blur 兜底）松开起跳；键盘 Space 同效。输入焦点在聊天框等输入控件时不会触发。
- **手感**：`useBeat` 以约 60fps 重绘；松手后先用本地预测播放自己的跳跃动画，不等服务器回包；服务器 `lastJump` 到了再接管。服务端 `tick` 改为 100ms，绳子的拖拽更顺。
- **绳子拦截动画**：`lastJump.ropePulled` 为 true 时，客户端先向 `rawTo` 方向做一个短促的冲刺再被拽回 `to`，避免被绳子拦住时看起来像原地卡住；同伴大跳后挂着的人由 `tick` 逐步拉回，不会瞬间平移。
- 相机取两人中点；跳跃/拉人/挂绳的坐标都在屏幕坐标里插值，蓄力条跟随自己，**不显示数字百分比**。
- 绳子用二次贝塞尔：两人靠近时下垂、距离变大时变直变粗、挂人时绷直发光并有小火花；挂着的猴子以手（局部 `(0,-54)`）为轴做钟摆摆动，救援进度越高会被吊得越高。
- HUD 有网络延迟小图标：取最近一次 WebSocket ping 的 RTT，绿色 ≤90ms、黄色 ≤180ms、红色更高；数据来自 `useRoom().latency`，通过 `StageProps.latency` 传给游戏。
- `.stage` 统一 `user-select: none`，避免拖动画布/连点时误选文字；聊天输入框等输入控件单独恢复可选中。
- 结算页由 `GameStageHost` 统一渲染，`ResultExtra` 展示米数/摔倒/互救/拉人/金币；`Stage` 不处理 `phase === "over"`。

## 测试

```bash
npm run test:game -- brothers
npm run build
SMOKE_PORT=18804 npm run smoke:game -- brothers
```

单测覆盖：开局无 `turn` + `tuning` + 金币、双方立即跳 + 独立冷却、轻点原地、按 `tuning` 反推跳到下一块、掉坑/尖刺挂绳、挂着不能跳、落平台后仍需快速连点救援、连点进度累积与停手回落、绳子最大长度（挂着与两人都活着）、被绳子拦住时记录 `rawTo/ropePulled`、一个人挂着时另一个人被慢慢拖、金币落地收集、双挂结束、只标记 finished / 两人都到才 finish、冲线过头、超时、结束后拒绝动作、summary 字段（meters/falls/rescued/pulls/coins/finished），以及 `makeLevel` / `platformAt` 测试。

冒烟流程：进入游戏后先让 A 跳进第一个坑，B 连续快速点 `pull` 救回；随后双方按 `tuning` 反推 hold，交替跳到各自终点（途中遇到挂绳会自动连点救援），断言 `overReason === "finish"`、两人 `finished`、金币有收集、纪念册 `data.finished === true` 且记录到 `pulls/rescued/coins`。
