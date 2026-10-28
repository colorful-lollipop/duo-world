import { useEffect, useMemo, useRef, useState } from "react";
import { GAME_MAP, type JournalEntry } from "../types";
import { getHistory } from "../lib/api";
import { getToken } from "../lib/storage";

interface RoomHistory {
  code: string;
  alive: boolean;
  wins: Record<string, [number, number]>;
}

function timeText(at: number) {
  try {
    return new Date(at).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function WinRow({ wins }: { wins: Record<string, [number, number]> }) {
  const rows = Object.entries(wins || {}).filter(
    ([, pair]) => Array.isArray(pair) && ((pair[0] || 0) > 0 || (pair[1] || 0) > 0),
  );
  if (!rows.length) return null;
  return (
    <div className="journal-wins">
      {rows.map(([id, pair]) => (
        <span key={id}>
          {GAME_MAP[id]?.emoji || "🏆"} {GAME_MAP[id]?.name || id} <b>{pair[0]}</b> : <b>{pair[1]}</b>
        </span>
      ))}
    </div>
  );
}

/**
 * 纪念册 / 历史战绩：
 * - 走 GET /api/rooms/:code/history（token 在 Authorization 头里）
 * - 房间过期了也还能查到（服务端落盘），所以在首页也能看「我们的回忆」
 * - `live` 是当前房间内存里的条目，会一起合并，避免刚打完一局还没刷新
 */
export function JournalView({ codes, live }: { codes: string[]; live?: JournalEntry[] }) {
  const key = useMemo(() => codes.filter(Boolean).join(","), [codes]);
  const liveRef = useRef<JournalEntry[] | undefined>(live);
  liveRef.current = live;
  const liveCount = live?.length || 0;

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [rooms, setRooms] = useState<RoomHistory[]>([]);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const targets = key
      .split(",")
      .filter(Boolean)
      .map((code) => ({ code, token: getToken(code) || "" }))
      .filter((t) => t.token);

    if (!targets.length) {
      const only = (liveRef.current || []).slice().sort((a, b) => b.at - a.at);
      setEntries(only);
      setRooms([]);
      setDenied(true);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    Promise.all(
      targets.map((t) =>
        getHistory(t.code, t.token)
          .then((res) => ({ code: t.code, res }))
          .catch(() => null),
      ),
    ).then((results) => {
      if (cancelled) return;
      const seen = new Map<string, JournalEntry>();
      const info: RoomHistory[] = [];
      let anyDenied = false;
      for (const item of results) {
        if (!item) {
          anyDenied = true;
          continue;
        }
        info.push({
          code: item.code,
          alive: item.res.alive,
          wins: (item.res.stats?.wins || {}) as Record<string, [number, number]>,
        });
        for (const e of item.res.entries) seen.set(e.id, { ...e, code: item.code });
      }
      for (const e of liveRef.current || []) if (!seen.has(e.id)) seen.set(e.id, e);
      setEntries([...seen.values()].sort((a, b) => b.at - a.at));
      setRooms(info);
      setDenied(anyDenied);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [key, liveCount]);

  if (loading) {
    return (
      <div className="journal-empty">
        <span className="spinner" />
        <p>正在翻开纪念册…</p>
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div className="journal-empty">
        <span>📖</span>
        <p>一起玩完第一局，这里就会留下你们的第一条回忆。</p>
        {denied && <p className="small-print muted">换过设备或清了缓存的话，回忆还在服务器上，但需要当初那台设备才能打开。</p>}
      </div>
    );
  }

  return (
    <div className="journal-view">
      <div className="journal-summary">
        <span>
          一共 <b>{entries.length}</b> 局回忆
        </span>
        {rooms.length === 1 ? (
          <span className="journal-code">
            小屋 {rooms[0].code}
            {rooms[0].alive ? "" : " · 已过期，回忆还在"}
          </span>
        ) : rooms.length > 1 ? (
          <span className="journal-code">{rooms.length} 间小屋</span>
        ) : null}
      </div>
      {rooms.length === 1 && <WinRow wins={rooms[0].wins} />}
      <div className="journal-list">
        {entries.map((j) => (
          <article key={j.id} className="journal-entry">
            <span className="journal-icon">{GAME_MAP[j.gameId]?.emoji || "💛"}</span>
            <div>
              <header>
                <b>{j.title}</b>
                <time>{timeText(j.at)}</time>
              </header>
              <p>{j.detail}</p>
              {rooms.length > 1 && j.code && <small className="journal-entry-code">小屋 {j.code}</small>}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
