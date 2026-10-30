# 心动乒乓（ping-pong）

原生接入小屋的双人实时 Pong，不需要额外服务、Socket.IO、账号或 iframe。现有房间 token 决定座位：0 左、1 右；客户端不能指定另一方座位。设置支持先到 5 分或 10 分。

## 开源来源与改造

- 上游：[iAlias/PingPongMultiplayer](https://github.com/iAlias/PingPongMultiplayer)
- 固定参考提交：`9c72ecc2011263011604561393a62433dab65df7`
- MIT，Copyright (c) 2026 Antonio Di Stefano；完整许可保留在 [../licenses/PingPongMultiplayer.txt](../licenses/PingPongMultiplayer.txt)，并通过 `public/licenses/PingPongMultiplayer.txt` 随站点构建分发，游戏内可打开。
- 参考上游 `server/server.js` 的服务器判球、击球位置产生旋转、回球逐渐加速的玩法；针对 duo-world 重写房间隔离、可靠身份、计时、限制、暂停和客户端 UI。没有复制上游服务器依赖或启动其代码。
- 不保留上游全局单局、Socket.IO、任选左右座位、断线直接清空、水平/垂直模式切换。此版本左右对战，手机使用整块球场拖动控制。

## 状态与生命周期

`phase`: ready → countdown（1500ms）→ playing → over；任意非结束阶段失去任意连接进入 paused，双方重新在线并各自 ready 后倒计时恢复。保留球、比分、回合数，清除移动意图；每次暂停递增 epoch。`rooms.mjs` 对本游戏在 detach / 连接接管时立即调用 tick 暂停，覆盖两个主循环之间的快速重连。持久化恢复先调用本游戏 `suspend`，使旧 epoch / 输入失效、清空双方准备状态，再允许重新连接；保留比分。中央 host 负责结束页面，中央 finalize 写纪念册，胜场位于 `stats.wins['ping-pong']`。

主要字段：`scores[2]`, `target`, `paddles[2]`（球拍中心 Y）、`targets[2]`、`ball{x,y,vx,vy}`、`ready[2]`、`epoch`、`countdownUntil`、`rally`、`bestRally`、`winner`、`wins[2]`。`tuning` 为 UI 几何，场地 1000×600。全部可 JSON 序列化，无模块级共享游戏状态。

## 动作

- `{type:'ready'}`：本人准备；仅 ready/paused 接受，必须双方在线。
- `{type:'move',y,epoch,at}`：目标位置，非直接修改坐标。仅 countdown/playing 接受；y 为有限数字 0..600、clamp 到 55..545；epoch 必须匹配当前局；at 用校准后的 `now()`，只接受过去 1 秒/未来 250ms 内、严格递增的时间。每座至少间隔 40ms，超额忽略。
- `{type:'resign'}`：当前座位认输，结束后不可重复计分。

前端每 50ms 最多发送一个移动目标，走 `send({type:'action',transient:'ping-pong',action:...})`。`useRoom` 中仅该明确消息类型不进入可靠队列：离线丢弃、重连不重放。ready/认输仍沿用现有可靠动作。失焦、隐藏、暂停、epoch 改变时清除本地输入。服务器验证独立于 UI。

## 物理与网络

复用主循环 100ms tick，内部固定 10ms 子步；最多补算 250ms，避免进程停顿/重启时爆 CPU 或瞬移。球拍最高 900 单位/秒，球初速度 (420,120)、每回球加速 5%、总速度最多 850；按接触偏移设置最大 ±60° 回球角，确保横向速度不趋零。球拍相交检查包含方向和前后位置，避免背后回弹；墙面反射保留超出距离。进球后中央发球并倒计时，不因断线自动判负。

前端只在相邻服务器快照之间做 100ms 插值，不推测碰撞或比分；网络稳定时体验最好。100ms 状态广播是现有框架限制，并非竞技级 60Hz 网络同步。

## 文件与测试

遵循元数据 / 服务端 / TSX / CSS / 单测 / 冒烟 / 文档自动发现约定，无游戏注册表改动。

```
npm run test:game -- ping-pong
npm run smoke:game -- ping-pong
npm run build
npm test
npm run smoke
```

单测覆盖房间隔离、设置校验、准备、倒计时、限速/边界、非法输入/时间/座位、墙和球拍碰撞、旋转/速度上限、进球/重新发球/终局/胜场/总结、暂停/恢复/旧输入、固定步长一致性和补帧上限。

真实 WebSocket 冒烟覆盖双方移动、非法输入、实际物理进球直至目标分、纪念册/胜场、重开清零、认输，以及单独房间的真实关闭连接→暂停→认证重连→双方准备→继续→旧 epoch 拒绝。浏览器手动验收建议：电脑鼠标/键盘，手机触摸；小高度横屏及窄屏；离线再连；返回大厅再开局。
