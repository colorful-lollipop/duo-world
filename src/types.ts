// 每个游戏一份 shared/games/<id>.json，文件名就是 id。
// 这里按 order 排序；没有中央登记表，新增/改动一款游戏不会碰到别款的元数据。
const metaModules = import.meta.glob<Omit<GameMeta, "id">>("../shared/games/*.json", {
  eager: true,
  import: "default",
});
const rawGames = Object.entries(metaModules)
  .map(([path, meta]) => ({ id: path.split("/").pop()!.replace(/\.json$/, ""), ...meta }))
  .sort((a, b) => (a.order || 0) - (b.order || 0));

export type AvatarId =
  | "bunny"
  | "bear"
  | "cat"
  | "dog"
  | "fox"
  | "penguin"
  | "pig"
  | "mouse"
  | "elephant"
  | "hippo"
  | "boar"
  | "donkey"
  | "cow";

export type Mood = "normal" | "joy" | "wow" | "sad" | "sleep";

export interface Profile {
  nickname: string;
  avatar: AvatarId;
  color: string;
  mood: Mood;
}

export interface SeatInfo {
  profile: Profile | null;
  connected: boolean;
  joinedAt: number;
}

export interface JournalEntry {
  id: string;
  gameId: string;
  title: string;
  detail: string;
  data: Record<string, unknown> | null;
  at: number;
  /** 只有跨小屋汇总的历史会带这个字段 */
  code?: string;
}

export interface GameState {
  id: string;
  run: string;
  startedAt: number;
  endedAt: number;
  journaled: boolean;
  data: any;
}

export interface RoomState {
  code: string;
  seats: [SeatInfo, SeatInfo];
  gameId: string;
  game: GameState | null;
  settings: Record<string, Record<string, any>>;
  journal: JournalEntry[];
  stats: { wins?: Record<string, [number, number]> };
  now: number;
  version: number;
}

export interface SettingOption {
  value: string | number;
  label: string;
}

export interface SettingField {
  type: "select" | "multi" | "text";
  key: string;
  label: string;
  default: string | number | string[];
  options?: SettingOption[];
  min?: number;
  maxLength?: number;
  placeholder?: string;
}

export interface GameMeta {
  id: string;
  order: number;
  name: string;
  emoji: string;
  tagline: string;
  intro: string;
  rules: string[];
  tags: string[];
  duration: string;
  net: string;
  gradient: [string, string];
  settings: SettingField[];
}

export const GAMES = rawGames as unknown as GameMeta[];
export const GAME_MAP = Object.fromEntries(GAMES.map((g) => [g.id, g])) as Record<string, GameMeta>;

export interface Session {
  code: string;
  seat: number;
  token: string;
}

export type SocketStatus = "connecting" | "online" | "offline" | "replaced" | "invalid";
