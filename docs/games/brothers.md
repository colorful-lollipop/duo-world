# 哥俩好（`brothers`）

两只猴子被一根绳子拴在一起，一起往前闯断桥。**双方各自实时控制自己的猴子**（没有回合）：按住蓄力，松开起跳；蓄力时会显示落点预览；掉下去会挂在绳子上，同伴落到平台上或按「拉一把」就能把你拽回来。两个人都到终点才算赢。

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
2. **蓄力**：`hold` 毫秒映射到 `jumpMin..jumpMax`，轻点是小跳（36），满蓄力是 300；服务端把 `hold` 夹到 `0..chargeMs`。
3. **落点预览**：客户端用同一套 `tuning` 公式画出虚线抛物线和落点圈，绿=能落脚，红=掉坑/尖刺，到终点线会额外标「终点！」。
4. **绳子**：
   - 一个人掉下去后 `alive=false`（挂在绳子上），不能自己跳，位置被约束在同伴 `±rope` 内（`tick` 也会在同伴跳走后拖拽）。
   - 同伴成功落到平台上时，如果挂着的兄弟在绳子够得着的地方（`|mate.x - me.x| <= rope`，或者挂点距离落点平台边缘 `<= rope`），自动拉上来（`rescued++`）。
   - `pull` 动作：站着（也可以已到终点）的人把挂着的同伴拉回自己所在的平台，有 `pullCooldownMs` 冷却（`pulls++`）。
   - 两个人都挂着 → 立刻结束（`both-fall`）。
5. **终点**：每人各自到终点记 `finished`，**两个人都 finished** 才 `finish`；跳过头（`to >= finishX`）也算冲线，不会判掉坑。先到的人可以等/拉同伴，但不能再跳。
6. **结束**：`finish`（两人都到）/ `both-fall`（两人都挂）/ `time`（超时）。

## 数值（全部由 `d.tuning` 下发给客户端）

| 字段 | 值 | 含义 |
| --- | --- | --- |
| `jumpMin` | 36 | `hold=0` 的跳跃距离 |
| `jumpMax` | 300 | 满蓄力距离 |
| `chargeMs` | 1400 | 蓄满需要按多久 |
| `cooldownMs` | 260 | 每次跳后的个人冷却 |
| `pullCooldownMs` | 900 | 拉人冷却 |
| `jumpMs` | 520 | 跳跃补间时长（动画） |
| `pullMs` | 420 | 拉人补间时长（动画） |
| `d.rope` | 300 | 绳长（水平约束） |

客户端不要重复写死这些数值；`predict()` 用 `d.tuning` 计算预览，保证和服务端落点一致。

## 数据形状

```js
{
  seed, count, spikes, platforms: [{x,w,y,spike}], finishX, baseY, rope,
  tuning: { jumpMin, jumpMax, chargeMs, cooldownMs, pullCooldownMs, jumpMs, pullMs },
  mon: [{ x, y, alive, finished, cooldownUntil, lastJumpAt, pullReadyAt }],
  phase,                    // playing | over
  overReason,               // finish | both-fall | time
  startedAt, endedAt, deadline, timeLimit,
  lastJump: [null, null],   // { seat, from, to, fromY, toY, startedAt, ms, result: "land"|"hang"|"finish" }
  lastPull: [null, null],   // { seat, fromX, fromY, toX, toY, startedAt, ms }（seat=拉人者）
  jumps, falls, rescued, pulls, distance,
}
```

- `mon[].y` 是平台高度；挂着时客户端把脚画在 `y - HANG_DROP`，绳子挂点在 `y`。
- `lastJump` 按座位各存一份，两个人可以同时处于跳跃补间。
- `lastPull[pullerSeat]` 由被拉的人播动画（客户端取 `lastPull[1 - mySeat]`）。
- `distance` 只记落到平台/被拉到的位置，用于 HUD 和结算米数。

## 动作

- `jump { hold }`：`hold` 毫秒（`0..chargeMs`，服务端夹紧；非数字拒绝）。要求自己 `alive && !finished` 且 `now >= cooldownUntil`，否则返回中文字符串错误。
- `pull`：要求自己 `alive`、同伴 `!alive`、`now >= pullReadyAt`；把自己平台上的同伴放到身边约 40px 处，`rescued++`、`pulls++`。

服务端所有落点/结束判定都在 `server/games/brothers.mjs`，客户端只发动作、渲染快照（`lastJump` / `lastPull` 做插值）。

## 关卡生成

- `makeLevel(seed, count, spikes)` 仍然是纯函数、同 seed 完全一致；`platformAt(platforms, x)` 保留导出，测试会直接用。
- 尖刺只会出现在 `4 <= i < count-1` 的平台，最后一块（终点）永远没有尖刺；尖刺平台不会连续出现，宽度被压到 62–82，前后坑都收窄到 ≤80，保证满蓄力能直接跳过整块尖刺平台，不会出现死局。
- 平台最大 gap 约为 190，`jumpMax=300` 足够；但如果落点太靠左，先在同一块平台上往右挪一小步再跳（客户端预览会显示落点，smoke 也是这么走的）。尖刺平台不要踩，直接跳过它。

## 客户端实现要点

- 在 `.brothers-world` 上 pointerdown 开始蓄力、pointerup/pointercancel（以及 window 上的 pointerup/blur 兜底）松开起跳；键盘 Space 同效。输入焦点在聊天框等输入控件时不会触发。松手动作放在 ref 里，避免 React 严格模式下 updater 重复发动作。
- 相机取两人中点；跳跃/拉人/挂绳的坐标都在屏幕坐标里插值，蓄力条和落点预览跟随自己。
- 绳子用二次贝塞尔：两人靠近时下垂、距离变大时变直变粗、挂人时绷直发光并有小火花；挂着的猴子以手（局部 `(0,-54)`）为轴做钟摆摆动。
- 结算页由 `GameStageHost` 统一渲染，`ResultExtra` 只展示米数/摔倒/互救/拉人；`Stage` 不处理 `phase === "over"`。

## 测试

```bash
npm run test:game -- brothers
npm run build
SMOKE_PORT=18804 npm run smoke:game -- brothers
```

单测覆盖：开局无 `turn` + `tuning`、双方立即跳 + 独立冷却、轻点原地、按 `tuning` 反推跳到下一块、掉坑/尖刺挂绳、挂着不能跳、落平台自动救援、`pull` 与冷却、绳子拖拽（`tick`）、双挂结束、只标记 finished / 两人都到才 finish、冲线过头、超时、结束后拒绝动作、summary 字段（meters/falls/rescued/pulls/finished），以及原有 `makeLevel` / `platformAt` 测试。

冒烟流程：进入游戏后先让 A 跳进第一个坑，B 用 `pull` 救回；随后双方按 `tuning` 反推 hold，交替跳到各自终点，断言 `overReason === "finish"`、两人 `finished`、纪念册 `data.finished === true` 且记录到 `pulls/rescued`。
