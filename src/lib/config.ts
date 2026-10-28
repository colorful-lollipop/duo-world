export interface DuoConfig {
  publicUrl: string | null;
  lanUrls: string[];
}

let cached: DuoConfig | null = null;
let promise: Promise<DuoConfig> | null = null;

export function fetchConfig(): Promise<DuoConfig> {
  if (cached) return Promise.resolve(cached);
  if (!promise) {
    promise = fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        cached = {
          publicUrl: typeof data?.publicUrl === "string" && data.publicUrl ? data.publicUrl : null,
          lanUrls: Array.isArray(data?.lanUrls) ? data.lanUrls.filter((x: unknown) => typeof x === "string") : [],
        };
        return cached;
      })
      .catch(() => {
        cached = { publicUrl: null, lanUrls: [] };
        return cached;
      });
  }
  return promise;
}

function isLocalHost() {
  const h = location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
}

/** 把服务端探测到的局域网地址，换成当前页面使用的端口（开发模式 Vite 是 5173）。 */
function lanBase(urls: string[]) {
  try {
    const u = new URL(urls[0]);
    if (location.port) u.port = location.port;
    return u.origin;
  } catch {
    return urls[0].replace(/\/+$/, "");
  }
}

/** 分享链接优先用 PUBLIC_URL；本机 localhost 打开时自动换成本机局域网地址，方便手机扫码。 */
export async function getShareBase(): Promise<string> {
  const cfg = cached || (await fetchConfig());
  if (cfg.publicUrl) return cfg.publicUrl.replace(/\/+$/, "");
  if (isLocalHost() && cfg.lanUrls.length) return lanBase(cfg.lanUrls);
  return location.origin.replace(/\/+$/, "");
}

export function getCachedShareBase(): string {
  if (cached?.publicUrl) return cached.publicUrl.replace(/\/+$/, "");
  if (isLocalHost() && cached?.lanUrls.length) return lanBase(cached.lanUrls);
  return location.origin.replace(/\/+$/, "");
}

export function buildRoomLink(base: string, code: string) {
  return `${base.replace(/\/+$/, "")}/r/${code}`;
}