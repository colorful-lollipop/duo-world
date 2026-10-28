import { useEffect, useReducer, useRef } from "react";

/** 让组件每 interval 毫秒刷新一次，用来跑倒计时。 */
export function useNow(now: () => number, active = true, interval = 220) {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const nowRef = useRef(now);
  nowRef.current = now;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => force(), interval);
    return () => clearInterval(timer);
  }, [active, interval]);
  return nowRef.current();
}

/** 客户端本地倒计时（只在需要时走）。 */
export function formatLeft(ms: number) {
  return Math.max(0, Math.ceil(ms / 1000));
}
