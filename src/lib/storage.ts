import type { AvatarId, Profile } from "../types";

const PROFILE_KEY = "duo.profile";
const LAST_ROOM_KEY = "duo.lastRoom";
const TOKEN_PREFIX = "duo.token.";
const SOUND_KEY = "duo.sound";

const AVATARS: AvatarId[] = ["bunny", "bear", "cat", "dog", "fox", "penguin"];
const COLORS = ["#FF6B6B", "#4D9DFF", "#2EC4A6", "#FFC93C", "#9B7BFF", "#FF9A76"];

export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p.nickname !== "string" || !p.nickname.trim()) return null;
    return {
      nickname: p.nickname.slice(0, 12),
      avatar: AVATARS.includes(p.avatar) ? p.avatar : "bunny",
      color: COLORS.includes(p.color) ? p.color : COLORS[0],
    };
  } catch {
    return null;
  }
}

export function saveProfile(profile: Profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {}
}

export function getToken(code: string): string | null {
  try {
    return localStorage.getItem(TOKEN_PREFIX + code.toUpperCase());
  } catch {
    return null;
  }
}

export function saveSession(code: string, token: string, profile?: Profile) {
  const c = code.toUpperCase();
  try {
    localStorage.setItem(TOKEN_PREFIX + c, token);
    localStorage.setItem(LAST_ROOM_KEY, c);
    if (profile) saveProfile(profile);
  } catch {}
}

export function clearToken(code: string) {
  try {
    localStorage.removeItem(TOKEN_PREFIX + code.toUpperCase());
  } catch {}
}

export function getLastRoom(): { code: string; token: string } | null {
  try {
    const code = localStorage.getItem(LAST_ROOM_KEY);
    if (!code) return null;
    const token = getToken(code);
    return token ? { code, token } : null;
  } catch {
    return null;
  }
}

export function loadSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveSound(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {}
}

export { AVATARS, COLORS };
