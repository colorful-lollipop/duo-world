// Adapted from iAlias/PingPongMultiplayer (MIT), Antonio Di Stefano, 2026.
// See docs/licenses/PingPongMultiplayer.txt and docs/games/ping-pong.md.
import { gameWins } from './_kit.mjs';

const TUNING = { width: 1000, height: 600, paddleHeight: 110, paddleWidth: 18, paddleInset: 40, ballRadius: 10 };
const STEP = 10;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const online = room => [0, 1].every(i => room.seats[i]?.ws?.readyState === 1);
function pauseIfOffline(room, now, force = false) {
  const d = room.game.data;
  if (d.phase === 'over' || online(room)) return false;
  if (d.phase === 'paused' && !force) return false;
  d.phase = 'paused'; d.ready = [false, false]; d.epoch++;
  d.targets = [...d.paddles]; d.lastInputAt = [0, 0];
  d.lastTickAt = now; d.accumulator = 0;
  return true;
}
function end(room, winner) {
  const d = room.game.data;
  if (d.phase === 'over') return;
  d.phase = 'over'; d.winner = winner;
  const wins = gameWins(room, 'ping-pong'); wins[winner]++; d.wins = [...wins];
}
function serve(d, direction, now) {
  d.ball = { x: 500, y: 300, vx: direction * 420, vy: (d.scores[0] + d.scores[1]) % 2 ? -120 : 120 };
  d.rally = 0; d.phase = 'countdown'; d.countdownUntil = now + 1500;
  d.accumulator = 0;
}
function step(room, now) {
  const d = room.game.data, b = d.ball;
  for (let i = 0; i < 2; i++) d.paddles[i] += clamp(d.targets[i] - d.paddles[i], -9, 9);
  if (d.phase !== 'playing') return;
  const oldX = b.x;
  b.x += b.vx * STEP / 1000; b.y += b.vy * STEP / 1000;
  // Reflect overshoot, rather than losing distance at the wall.
  if (b.y < 10) { b.y = 20 - b.y; b.vy = Math.abs(b.vy); }
  if (b.y > 590) { b.y = 1180 - b.y; b.vy = -Math.abs(b.vy); }
  const side = b.vx < 0 ? 0 : 1;
  const face = side === 0 ? 68 : 932;
  const crossed = side === 0 ? oldX >= face && b.x <= face : oldX <= face && b.x >= face;
  if (crossed && Math.abs(b.y - d.paddles[side]) <= 65) {
    // Upstream hit-position spin and acceleration, with a capped total speed.
    const offset = clamp((b.y - d.paddles[side]) / 55, -1, 1);
    const speed = Math.min(850, Math.hypot(b.vx, b.vy) * 1.05);
    const angle = offset * Math.PI / 3;
    b.vx = (side === 0 ? 1 : -1) * Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed; b.x = face;
    d.rally++; d.bestRally = Math.max(d.bestRally, d.rally);
  }
  if (b.x < -10 || b.x > 1010) {
    const winner = b.x < 0 ? 1 : 0;
    d.scores[winner]++;
    if (d.scores[winner] >= d.target) end(room, winner);
    else serve(d, winner === 0 ? 1 : -1, now);
  }
}
export default {
  // Persistence restore also resets a partially-ready paused game.
  suspend(room, now) { return pauseIfOffline(room, now, true); },
  create(room) {
    const now = Date.now();
    return { phase: 'ready', ready: [false, false], epoch: now * 1000 + Math.floor(Math.random() * 1000),
      tuning: { ...TUNING }, target: Number(room.settings['ping-pong']?.target) === 10 ? 10 : 5,
      scores: [0, 0], paddles: [300, 300], targets: [300, 300],
      ball: { x: 500, y: 300, vx: 420, vy: 120 }, rally: 0, bestRally: 0,
      winner: null, wins: [...gameWins(room, 'ping-pong')], countdownUntil: 0,
      lastTickAt: now, accumulator: 0, lastInputAt: [0, 0] };
  },
  action(room, seat, action, now) {
    const d = room.game.data;
    if (seat !== 0 && seat !== 1) return '无效的座位';
    if (d.phase === 'over') return '这一局已经结束啦';
    pauseIfOffline(room, now);
    if (action?.type === 'resign') { end(room, 1 - seat); return null; }
    if (!online(room)) return '等两个人都在线再继续吧';
    if (action?.type === 'ready') {
      if (!['ready', 'paused'].includes(d.phase)) return '已经开始啦';
      d.ready[seat] = true;
      if (d.ready.every(Boolean)) { d.phase = 'countdown'; d.countdownUntil = now + 1500; d.lastTickAt = now; d.accumulator = 0; }
      return null;
    }
    if (action?.type !== 'move') return '这个操作暂时不可以';
    if (!['playing', 'countdown'].includes(d.phase)) return '准备好以后再挥拍吧';
    if (typeof action.y !== 'number' || !Number.isFinite(action.y) || action.y < 0 || action.y > 600) return '球拍位置无效';
    if (action.epoch !== d.epoch || typeof action.at !== 'number' || !Number.isFinite(action.at) ||
        now - action.at > 1000 || action.at - now > 250 || action.at <= d.lastInputAt[seat]) return '过期的球拍动作';
    // Ignore excess valid moves without flooding the UI with errors.
    if (action.at - d.lastInputAt[seat] < 40) return null;
    d.lastInputAt[seat] = action.at;
    d.targets[seat] = clamp(action.y, 55, 545);
    return null;
  },
  tick(room, now) {
    const d = room.game.data;
    if (d.phase === 'over') return false;
    if (pauseIfOffline(room, now)) return true;
    if (d.phase === 'ready' || d.phase === 'paused') { d.lastTickAt = now; return false; }
    const elapsed = clamp(now - d.lastTickAt, 0, 250); d.lastTickAt = now;
    if (d.phase === 'countdown' && now >= d.countdownUntil) {
      // Never simulate the countdown as ball travel or catch up a long suspended process.
      d.phase = 'playing'; d.accumulator = 0; return true;
    }
    d.accumulator += elapsed;
    while (d.accumulator >= STEP) {
      d.accumulator -= STEP; step(room, now);
      if (d.phase === 'over' || (d.phase === 'countdown' && d.countdownUntil === now + 1500)) break;
    }
    return elapsed > 0;
  },
  summary(room) {
    const d = room.game.data;
    return { title: '心动乒乓', detail: `${room.seats[d.winner]?.profile?.nickname || 'TA'} 赢啦 · ${d.scores.join(' : ')} · 最长 ${d.bestRally} 次回球`,
      data: { winner: d.winner, scores: [...d.scores], bestRally: d.bestRally } };
  },
};
