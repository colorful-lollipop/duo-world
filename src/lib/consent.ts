// 法务同意记录：只在本地记「同意过哪个版本」，不上传、不追踪。
// 文案有实质变更时把 CONSENT_VERSION 改掉，用户会被再问一次。
import { CONSENT_VERSION } from "./legal";

const CONSENT_KEY = "duo.consent";

export interface ConsentRecord {
  version: string;
  at: number;
}

export function loadConsent(): ConsentRecord | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw);
    if (!rec || typeof rec.version !== "string") return null;
    return { version: rec.version, at: Number(rec.at) || 0 };
  } catch {
    return null;
  }
}

export function hasConsented() {
  return loadConsent()?.version === CONSENT_VERSION;
}

export function recordConsent() {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ version: CONSENT_VERSION, at: Date.now() }));
  } catch {
    /* 隐私模式下写不进去，也不该拦住用户 */
  }
}
