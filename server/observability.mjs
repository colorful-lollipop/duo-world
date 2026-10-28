// 轻量结构化日志 + Prometheus 指标（无额外依赖）。
// 日志一行一个 JSON，便于 1Panel / docker logs / journalctl 直接收集。
import os from "node:os";

const counters = {
  http_requests_total: 0,
  http_errors_total: 0,
  rooms_created_total: 0,
  ws_connections_total: 0,
  ws_messages_total: 0,
  ws_auth_failures_total: 0,
  games_started_total: 0,
  journal_entries_total: 0,
};

let roomsActive = 0;
let gameTicks = 0;

export function inc(name, n = 1) {
  if (counters[name] !== undefined) counters[name] += n;
}

export function setRoomsActive(n) {
  roomsActive = n;
}

export function incTicks() {
  gameTicks++;
}

export function log(level, msg, ctx = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...ctx,
  });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export function metricsText() {
  const mem = process.memoryUsage();
  const lines = [
    "# HELP duo_rooms_active 当前内存中的房间数",
    "# TYPE duo_rooms_active gauge",
    `duo_rooms_active ${roomsActive}`,
    "# HELP duo_http_requests_total HTTP 请求数",
    "# TYPE duo_http_requests_total counter",
    `duo_http_requests_total ${counters.http_requests_total}`,
    "# HELP duo_http_errors_total HTTP 5xx 数",
    "# TYPE duo_http_errors_total counter",
    `duo_http_errors_total ${counters.http_errors_total}`,
    "# HELP duo_rooms_created_total 创建房间数",
    "# TYPE duo_rooms_created_total counter",
    `duo_rooms_created_total ${counters.rooms_created_total}`,
    "# HELP duo_ws_connections_total WebSocket 连接数",
    "# TYPE duo_ws_connections_total counter",
    `duo_ws_connections_total ${counters.ws_connections_total}`,
    "# HELP duo_ws_messages_total WebSocket 消息数",
    "# TYPE duo_ws_messages_total counter",
    `duo_ws_messages_total ${counters.ws_messages_total}`,
    "# HELP duo_ws_auth_failures_total WS 认证失败数",
    "# TYPE duo_ws_auth_failures_total counter",
    `duo_ws_auth_failures_total ${counters.ws_auth_failures_total}`,
    "# HELP duo_games_started_total 开局数",
    "# TYPE duo_games_started_total counter",
    `duo_games_started_total ${counters.games_started_total}`,
    "# HELP duo_journal_entries_total 纪念册条目数",
    "# TYPE duo_journal_entries_total counter",
    `duo_journal_entries_total ${counters.journal_entries_total}`,
    "# HELP duo_game_ticks_total 游戏 tick 次数",
    "# TYPE duo_game_ticks_total counter",
    `duo_game_ticks_total ${gameTicks}`,
    "# HELP duo_process_resident_memory_bytes 进程内存",
    "# TYPE duo_process_resident_memory_bytes gauge",
    `duo_process_resident_memory_bytes ${mem.rss}`,
    "# HELP duo_process_uptime_seconds 进程运行时间",
    "# TYPE duo_process_uptime_seconds gauge",
    `duo_process_uptime_seconds ${Math.round(process.uptime())}`,
    "# HELP duo_load1 1 分钟负载",
    "# TYPE duo_load1 gauge",
    `duo_load1 ${os.loadavg()[0]}`,
    "",
  ];
  return lines.join("\n");
}
