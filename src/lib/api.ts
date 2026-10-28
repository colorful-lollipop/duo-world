import type { Profile, RoomState } from "../types";

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = "ERROR", status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/" + path, {
      ...init,
      headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers || {}) },
    });
  } catch {
    throw new ApiError("连接不上小屋，检查一下网络吧", "NETWORK", 0);
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    throw new ApiError("服务开小差了，稍后再试一次吧", "BAD_RESPONSE", res.status);
  }
  if (!res.ok) throw new ApiError(data?.message || "操作失败，请重试", data?.code || "ERROR", res.status);
  return data as T;
}

export interface RoomTicket {
  code: string;
  seat: number;
  token: string;
  state: RoomState;
}

export function createRoom(profile: Profile) {
  return request<RoomTicket>("rooms", { method: "POST", body: JSON.stringify({ profile }) });
}

export function joinRoom(code: string, profile: Profile) {
  return request<RoomTicket>("rooms/" + encodeURIComponent(code) + "/join", {
    method: "POST",
    body: JSON.stringify({ profile }),
  });
}

export interface PublicRoomInfo {
  code: string;
  full: boolean;
  gameId: string;
  seats: { nickname: string | null; avatar: string | null; color: string | null; mood: string | null }[];
}

export function getRoomInfo(code: string) {
  return request<PublicRoomInfo>("rooms/" + encodeURIComponent(code));
}

export interface HistoryResponse {
  code: string;
  alive: boolean;
  entries: {
    id: string;
    gameId: string;
    title: string;
    detail: string;
    data: Record<string, unknown> | null;
    at: number;
  }[];
  stats: { wins?: Record<string, [number, number]> };
}

/** 历史战绩 / 纪念册：token 走 Authorization 头，房间过期后也还能查到。 */
export function getHistory(code: string, token: string) {
  return request<HistoryResponse>("rooms/" + encodeURIComponent(code) + "/history", {
    headers: { Authorization: "Bearer " + token },
  });
}

export interface ExportResponse extends HistoryResponse {
  exportedAt: string;
  seat: number;
  seats: { seat: number; nickname: string; avatar?: string; mood?: string }[];
}

/** 导出这间小屋的全部数据（纪念册 + 战绩 + 座位昵称）。 */
export function exportRoomData(code: string, token: string) {
  return request<ExportResponse>("rooms/" + encodeURIComponent(code) + "/export", {
    headers: { Authorization: "Bearer " + token },
  });
}

/** 注销这间小屋：房间、纪念册、战绩、座位一起删掉。 */
export function deleteRoomData(code: string, token: string) {
  return request<{ ok: boolean; code: string; removed: Record<string, number> }>(
    "rooms/" + encodeURIComponent(code),
    { method: "DELETE", headers: { Authorization: "Bearer " + token } },
  );
}
