import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomState, SocketStatus } from "../types";

export interface Reaction {
  id: string;
  seat: number;
  emoji: string;
}

type Listener = (msg: any) => void;

function wsUrl(code: string) {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws?code=${encodeURIComponent(code)}`;
}

export function useRoom(code: string, token: string | null) {
  const [state, setState] = useState<RoomState | null>(null);
  const [seat, setSeat] = useState<number | null>(null);
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [latency, setLatency] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [welcomeSeq, setWelcomeSeq] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const offsetRef = useRef(0);
  const listeners = useRef(new Set<Listener>());
  const retryRef = useRef(0);
  const closedByUs = useRef(false);
  const stateFrameRef = useRef<number | undefined>(undefined);
  const pendingStateRef = useRef<RoomState | null>(null);
  const authedRef = useRef(false);
  const cidSeq = useRef(0);
  /** 断网时排队的动作：重连（welcome）后按顺序补发，服务端用 cid 去重 */
  const pendingRef = useRef(new Map<string, { msg: Record<string, unknown>; at: number }>());
  const reconnectTimer = useRef<number | undefined>(undefined);
  const noticeTimer = useRef<number | undefined>(undefined);
  const lastNotify = useRef({ text: "", at: 0 });

  const notify = useCallback((text: string) => {
    const now = Date.now();
    if (text === lastNotify.current.text && now - lastNotify.current.at < 1200) return;
    lastNotify.current = { text, at: now };
    setNotice({ id: now + Math.random(), text });
  }, []);

  useEffect(() => {
    if (!notice) return;
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(noticeTimer.current);
  }, [notice]);

  const now = useCallback(() => Date.now() + offsetRef.current, []);

  const flushPending = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !authedRef.current) return;
    const items = [...pendingRef.current.entries()];
    for (const [cid, { msg }] of items) {
      try {
        ws.send(JSON.stringify(msg));
      } catch {
        pendingRef.current.delete(cid);
      }
    }
  }, []);

  const send = useCallback(
    (msg: Record<string, unknown>) => {
      const ws = wsRef.current;
      const online = ws && ws.readyState === WebSocket.OPEN && authedRef.current;
      // 球拍位置是瞬时输入，不加入可靠动作队列，避免断线后重放旧手势。
      if (msg.type === "action" && msg.transient === "ping-pong" &&
          (msg.action as { type?: string } | undefined)?.type === "move") {
        if (!online) return false;
        try { ws.send(JSON.stringify(msg)); return true; } catch { return false; }
      }
      if (msg.type === "action") {
        // 动作带 cid：服务端去重 + 客户端按 ack 出队；断网时先排队，连上自动补发
        const cid = `${Date.now().toString(36)}-${(++cidSeq.current).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const payload = { ...msg, cid };
        if (online) {
          try {
            ws.send(JSON.stringify(payload));
            if (pendingRef.current.size < 40) pendingRef.current.set(cid, { msg: payload, at: Date.now() });
            return true;
          } catch {
            /* 落到下面的排队 */
          }
        }
        if (pendingRef.current.size < 40) {
          pendingRef.current.set(cid, { msg: payload, at: Date.now() });
          notify("网络还没接上，这一步会先存着，连上就补发");
          return true;
        }
        notify("待补发的动作有点多，等网络恢复再试一下");
        return false;
      }
      if (online) {
        ws.send(JSON.stringify(msg));
        return true;
      }
      notify("还在连接中，稍等一下再试");
      return false;
    },
    [notify],
  );

  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  const pushReaction = useCallback((r: Reaction) => {
    setReactions((list) => [...list.slice(-8), r]);
    window.setTimeout(() => {
      setReactions((list) => list.filter((x) => x.id !== r.id));
    }, 2800);
  }, []);

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    closedByUs.current = false;

    const connect = () => {
      if (closedByUs.current) return;
      setStatus((s) => (s === "online" ? s : "connecting"));
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl(code));
      } catch {
        setStatus("offline");
        return;
      }
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        let msg: any;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        switch (msg.type) {
          case "welcome": {
            authedRef.current = true;
            setSeat(msg.seat);
            setState(msg.state);
            setStatus("online");
            retryRef.current = 0;
            offsetRef.current = msg.state.now - Date.now();
            setWelcomeSeq((n) => n + 1);
            flushPending();
            // 一进来就测一次，不用等 4 秒后的第一个心跳
            try {
              ws.send(JSON.stringify({ type: "ping", t: Date.now() }));
            } catch {}
            break;
          }
          case "ack": {
            if (typeof msg.cid === "string") pendingRef.current.delete(msg.cid);
            break;
          }
          case "state": {
            // 哥俩好允许两人同时起跳，两个 state 经常在同一帧到达；
            // 合并到下一帧只触发一次 React 渲染，避免「一起跳」时连续重绘卡一下。
            if (msg.state?.game?.id === "brothers") {
              pendingStateRef.current = msg.state;
              if (stateFrameRef.current === undefined) {
                const flush = () => {
                  stateFrameRef.current = undefined;
                  const next = pendingStateRef.current;
                  pendingStateRef.current = null;
                  if (!next) return;
                  setState(next);
                  setStatus("online");
                  offsetRef.current = next.now - Date.now();
                };
                if (typeof window.requestAnimationFrame === "function") {
                  stateFrameRef.current = window.requestAnimationFrame(flush);
                } else {
                  stateFrameRef.current = window.setTimeout(flush, 0);
                }
              }
              break;
            }
            setState(msg.state);
            setStatus("online");
            offsetRef.current = msg.state.now - Date.now();
            break;
          }
          case "pong": {
            const rtt = Date.now() - Number(msg.t || 0);
            if (Number.isFinite(rtt) && rtt >= 0 && rtt < 30000) {
              setLatency(Math.round(rtt));
              offsetRef.current = msg.now - (Number(msg.t) + rtt / 2);
            }
            break;
          }
          case "error": {
            notify(String(msg.message || "这一步没成功，再试一下"));
            break;
          }
          case "ink-sync": {
            setState((prev) => {
              if (!prev?.game) return prev;
              return { ...prev, game: { ...prev.game, data: { ...prev.game.data, strokes: msg.strokes } } };
            });
            listeners.current.forEach((fn) => fn(msg));
            break;
          }
          case "ink": {
            listeners.current.forEach((fn) => fn(msg));
            break;
          }
          case "reaction": {
            pushReaction({ id: `${Date.now()}-${Math.random()}`, seat: msg.seat, emoji: msg.emoji });
            break;
          }
          default: {
            listeners.current.forEach((fn) => fn(msg));
          }
        }
      };

      ws.onopen = () => {
        // token 放在首帧 auth 里，不再出现在 URL / 反代日志中
        authedRef.current = false;
        try {
          ws.send(JSON.stringify({ type: "auth", token }));
        } catch {}
        setStatus((s) => (s === "online" ? s : "connecting"));
        offsetRef.current = offsetRef.current || 0;
      };

      ws.onclose = (ev) => {
        if (wsRef.current !== ws) return;
        wsRef.current = null;
        authedRef.current = false;
        if (closedByUs.current) return;
        if (ev.code === 4001 || ev.code === 4004) {
          setStatus("invalid");
          return;
        }
        if (ev.code === 4002) {
          setStatus("replaced");
          return;
        }
        setStatus("offline");
        setLatency(null);
        retryRef.current = Math.min(retryRef.current + 1, 5);
        const delay = Math.min(700 * retryRef.current, 5000);
        window.clearTimeout(reconnectTimer.current);
        reconnectTimer.current = window.setTimeout(connect, delay);
      };

      ws.onerror = () => {};
    };

    connect();

    const onVisible = () => {
      if (document.visibilityState === "visible" && !wsRef.current && !closedByUs.current) {
        retryRef.current = 0;
        connect();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    const ping = window.setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping", t: Date.now() }));
      }
    }, 4000);

    return () => {
      closedByUs.current = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(ping);
      window.clearTimeout(reconnectTimer.current);
      if (stateFrameRef.current !== undefined) {
        if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(stateFrameRef.current);
        else window.clearTimeout(stateFrameRef.current);
        stateFrameRef.current = undefined;
      }
      pendingStateRef.current = null;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [code, token, notify, pushReaction, flushPending]);

  const act = useCallback(
    (action: Record<string, unknown>) => {
      return send({ type: "action", action });
    },
    [send],
  );

  return { state, seat, status, latency, notice, notify, send, act, now, subscribe, reactions, welcomeSeq, setStatus };
}
