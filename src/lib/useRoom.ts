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
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [welcomeSeq, setWelcomeSeq] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const offsetRef = useRef(0);
  const listeners = useRef(new Set<Listener>());
  const retryRef = useRef(0);
  const closedByUs = useRef(false);
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

  const send = useCallback(
    (msg: Record<string, unknown>) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
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
            setSeat(msg.seat);
            setState(msg.state);
            setStatus("online");
            retryRef.current = 0;
            offsetRef.current = msg.state.now - Date.now();
            setWelcomeSeq((n) => n + 1);
            break;
          }
          case "state": {
            setState(msg.state);
            setStatus("online");
            offsetRef.current = msg.state.now - Date.now();
            break;
          }
          case "pong": {
            const rtt = Date.now() - Number(msg.t || 0);
            if (Number.isFinite(rtt) && rtt >= 0 && rtt < 30000) {
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
        try {
          ws.send(JSON.stringify({ type: "auth", token }));
        } catch {}
        setStatus((s) => (s === "online" ? s : "connecting"));
        offsetRef.current = offsetRef.current || 0;
      };

      ws.onclose = (ev) => {
        if (wsRef.current !== ws) return;
        wsRef.current = null;
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
    }, 15000);

    return () => {
      closedByUs.current = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(ping);
      window.clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [code, token, notify, pushReaction]);

  const act = useCallback(
    (action: Record<string, unknown>) => {
      return send({ type: "action", action });
    },
    [send],
  );

  return { state, seat, status, notice, notify, send, act, now, subscribe, reactions, welcomeSeq, setStatus };
}
