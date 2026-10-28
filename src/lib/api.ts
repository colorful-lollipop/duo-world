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
  seats: { nickname: string | null; avatar: string | null; color: string | null }[];
}

export function getRoomInfo(code: string) {
  return request<PublicRoomInfo>("rooms/" + encodeURIComponent(code));
}
