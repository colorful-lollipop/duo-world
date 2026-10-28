# 哥俩好（`brothers`）

两只猴子被一根绳子拴在一起，一起往前闯断桥。**双方各自实时控制自己的猴子**（不再轮流）：按住蓄力，松开起跳；掉下去会挂在绳子上，同伴可以跳到平台上或按「拉一把」把你拽回来。两个人都掉下去才输。

## 文件

| 作用 | 路径 |
| --- | --- |
| 元数据 / 设置 | `shared/games/brothers.json` |
| 服务端规则 | `server/games/brothers.mjs` |
| 客户端 | `src/games/brothers.tsx` |
| 样式 | `src/games/brothers.css` |
| 单测 | `tests/unit/brothers.test.mjs` |
| 端到端 | `scripts/smoke/brothers.mjs` |

## 目标玩法（本次重构的验收标准）

1. **实时**：`turn` 字段删除；两个座位随时可以跳，互不等待。每个座位有自己的冷却时间。
2. **轻点不再直接掉坑**：`hold` 映射到 `JUMP_MIN..JUMP_MAX`，轻点是小跳（落在原地平台上），长按才跳远。服务端把 `hold` 夹到 `0..CHARGE_MS`。
3. **落点预览**：客户端蓄力时画出预测落点/抛物线，绿色=能落平台，红色=会掉坑；这样玩家能看见「过程」。
4. **绳子机制**：
   - 一个人掉下去后 `alive=false`（挂在绳子上），不能自己跳；位置被绳子约束在同伴 `±rope` 内。
   - 同伴成功落到平台上时，如果挂着的兄弟在绳子范围内，自动拉上来（`rescued++`）。
   - 新增 `pull` 动作：站着的人可以把挂着的同伴拉回自己所在的平台（有冷却，`pulls++`），客户端画绳子收紧的动画。
   - 两个人都挂着 → 结束（`both-fall`）。
5. **终点**：每个人各自到终点记为 `finished`，**两个人都到终点**才 `finish`；先到的人可以等/拉同伴。
6. **视觉**：绳子随两人距离变紧、下垂、发光；挂着的人像钟摆一样晃；蓄力条 + 落点标记；至少一个「拉一把」按钮。
7. 数值（`JUMP_MIN / JUMP_MAX / CHARGE_MS / 冷却 / rope`）通过 `data.tuning` 下发给客户端，客户端不要抄一份常量。

## 数据形状（目标）

```js
{
  seed, count, spikes, platforms: [{x,w,y,spike}], finishX, baseY, rope,
  tuning: { jumpMin, jumpMax, chargeMs, cooldownMs, pullCooldownMs, jumpMs },
  mon: [{ x, y, alive, finished, cooldownUntil, lastJumpAt }],
  phase,                    // playing | over
  overReason,               // finish | both-fall | time
  startedAt, endedAt, deadline, timeLimit,
  lastJump: [null, null],   // 每个座位一份补间 { seat, from, to, fromY, toY, startedAt, ms, result }
  lastPull: [null, null],   // 拉人动画
  jumps, falls, rescued, pulls, distance,
}
```

## 动作

- `jump { hold }`：`hold` 毫秒（0..CHARGE_MS，服务端夹紧）。
- `pull`：队友挂着时把自己这侧的绳子收紧，把队友拉上来。

## 测试

```bash
npm run test:game -- brothers
npm run smoke:game -- brothers
```

单测要覆盖：双方同时跳、冷却、轻点落在原地、掉坑挂绳、绳子拖拽、同伴落平台自动救援、`pull` 救援、双挂结束、两人都到终点才 finish、超时、结算数据。
