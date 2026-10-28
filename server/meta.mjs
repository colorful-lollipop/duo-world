import fs from "node:fs";

const metaUrl = new URL("../shared/games.json", import.meta.url);
export const GAMES = JSON.parse(fs.readFileSync(metaUrl, "utf8"));
export const GAME_MAP = Object.fromEntries(GAMES.map((g) => [g.id, g]));

export function defaultSettings(gameId) {
  const meta = GAME_MAP[gameId];
  if (!meta) return {};
  const out = {};
  for (const field of meta.settings || []) out[field.key] = clone(field.default);
  return out;
}

export function allDefaultSettings() {
  const out = {};
  for (const g of GAMES) out[g.id] = defaultSettings(g.id);
  return out;
}

export function sanitizeSettings(gameId, patch, base) {
  const meta = GAME_MAP[gameId];
  if (!meta) return { ...base };
  const out = { ...base };
  for (const field of meta.settings || []) {
    if (!patch || !(field.key in patch)) continue;
    const value = patch[field.key];
    if (field.type === "select") {
      const allowed = field.options.map((o) => o.value);
      if (allowed.includes(value)) out[field.key] = value;
    } else if (field.type === "multi") {
      if (!Array.isArray(value)) continue;
      const allowed = field.options.map((o) => o.value);
      const picked = [...new Set(value.filter((v) => allowed.includes(v)))];
      if (picked.length >= (field.min || 1)) out[field.key] = picked;
    } else if (field.type === "text") {
      if (typeof value === "string") out[field.key] = value.trim().slice(0, field.maxLength || 40);
    }
  }
  return out;
}

function clone(v) {
  return typeof v === "object" && v !== null ? JSON.parse(JSON.stringify(v)) : v;
}
