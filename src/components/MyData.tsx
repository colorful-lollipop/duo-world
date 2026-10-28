import { useMemo, useState } from "react";
import { deleteRoomData, exportRoomData } from "../lib/api";
import { clearToken, forgetRoom, knownRoomsWithToken } from "../lib/storage";
import { Icon } from "./Icon";

interface Row {
  code: string;
  token: string;
  state: "idle" | "busy" | "gone" | "error";
  note?: string;
}

function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** 首页「我的数据」：按小屋导出（JSON）或删除（不可恢复）。 */
export function MyData({ onChanged }: { onChanged?: () => void }) {
  const initial = useMemo(() => knownRoomsWithToken(), []);
  const [rows, setRows] = useState<Row[]>(initial.map((r) => ({ code: r.code, token: r.token, state: "idle" })));
  const [busy, setBusy] = useState<"" | "export" | "delete">("");
  const [note, setNote] = useState("");

  const update = (code: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.code === code ? { ...r, ...patch } : r)));

  const exportOne = async (row: Row) => {
    if (busy) return;
    update(row.code, { state: "busy" });
    try {
      const data = await exportRoomData(row.code, row.token);
      downloadJson(`duo-world-${row.code}.json`, data);
      update(row.code, { state: "idle", note: "已导出 ✓" });
    } catch (err) {
      update(row.code, { state: "error", note: err instanceof Error ? err.message : "导出失败" });
    }
  };

  const exportAll = async () => {
    if (busy) return;
    setBusy("export");
    setNote("");
    const rooms: Record<string, unknown> = {};
    const out = { exportedAt: new Date().toISOString(), rooms };
    let failed = 0;
    for (const row of rows) {
      if (row.state === "gone") continue;
      try {
        rooms[row.code] = await exportRoomData(row.code, row.token);
      } catch {
        failed++;
      }
    }
    downloadJson("duo-world-all.json", out);
    setBusy("");
    setNote(failed ? `导出完成，${failed} 间小屋没有成功（可能已被删除或换过设备）` : `导出完成，共 ${rows.length} 间小屋`);
  };

  const removeOne = async (row: Row) => {
    if (busy) return;
    const ok = window.confirm(`删除小屋 ${row.code}？\n\n它的纪念册、战绩和座位记录会一起删掉，而且不可恢复。`);
    if (!ok) return;
    update(row.code, { state: "busy" });
    try {
      await deleteRoomData(row.code, row.token);
    } catch (err) {
      // 已经过期/被删的小屋也一并清掉本地记录
      void err;
    }
    update(row.code, { state: "gone" });
    clearToken(row.code);
    forgetRoom(row.code);
    onChanged?.();
  };

  const removeAll = async () => {
    if (busy) return;
    const ok = window.confirm(`删除全部 ${rows.length} 间小屋？\n\n包括纪念册、战绩和座位记录，不可恢复。`);
    if (!ok) return;
    setBusy("delete");
    for (const row of rows) {
      if (row.state === "gone") continue;
      try {
        await deleteRoomData(row.code, row.token);
      } catch {
        // 已失效的忽略
      }
      clearToken(row.code);
      forgetRoom(row.code);
    }
    setRows((prev) => prev.map((r) => ({ ...r, state: "gone" })));
    setBusy("");
    onChanged?.();
  };

  if (!rows.length) {
    return (
      <div className="journal-empty">
        <span>🗂️</span>
        <p>还没有待过的小屋。创建或加入一间之后，就能在这里导出或删除数据。</p>
      </div>
    );
  }

  return (
    <div className="my-data">
      <div className="my-data-actions">
        <button className="secondary" disabled={busy !== ""} onClick={exportAll}>
          <Icon name="download" size={16} /> 导出全部（JSON）
        </button>
        <button className="danger-button" disabled={busy !== ""} onClick={removeAll}>
          <Icon name="trash" size={16} /> 删除全部数据
        </button>
      </div>
      {note && <p className="small-print muted">{note}</p>}
      <div className="my-data-list">
        {rows.map((row) => (
          <div className={"my-data-row " + (row.state === "gone" ? "gone" : "")} key={row.code}>
            <div className="my-data-room">
              <b>小屋 {row.code}</b>
              <span className="small-print muted">
                {row.state === "gone" ? "已删除" : row.note || "纪念册与战绩"}
              </span>
            </div>
            <div className="my-data-buttons">
              {row.state === "gone" ? (
                <span className="small-print muted">✓</span>
              ) : (
                <>
                  <button
                    className="text-button"
                    disabled={busy !== ""}
                    onClick={() => exportOne(row)}
                  >
                    <Icon name="download" size={14} /> 导出
                  </button>
                  <button
                    className="text-button danger-text"
                    disabled={busy !== ""}
                    onClick={() => removeOne(row)}
                  >
                    <Icon name="trash" size={14} /> 删除
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="small-print muted my-data-hint">
        删除会同时清除这间小屋在服务器上的记录，立即生效、不可恢复；换设备或清缓存后，原设备留下的数据一样可以通过这里删除。
      </p>
    </div>
  );
}
