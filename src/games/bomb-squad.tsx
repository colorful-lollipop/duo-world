// 一起拆弹：游戏界面（文件名 = 游戏 id）
// 会按需加载：只有开局才下载这个 chunk。
// 样式只写在自己的 bomb-squad.css 里，不要动 src/styles.css。
//
// 信息不对称：拆弹员拿到 bomb，专家拿到 manual（服务端 view 已经按座位裁好）。
// Stage 不处理 phase === "over"，结算页由 GameStageHost 统一渲染。
import { useEffect, useRef, useState } from "react";
import "./bomb-squad.css";
import type { ResultExtraProps, StageProps } from "./types";
import { useNow } from "../lib/useNow";
import { sfx } from "../lib/sound";

const WIRE_COLORS: Record<string, string> = {
  红: "#E4572E",
  蓝: "#4D9DFF",
  黄: "#F2B134",
  白: "#FFFDF6",
  黑: "#3A2618",
};

const SYMBOLS: Record<string, { label: string; emoji: string }> = {
  sun: { label: "太阳", emoji: "☀️" },
  star: { label: "星星", emoji: "⭐" },
  moon: { label: "月亮", emoji: "🌙" },
  rain: { label: "雨滴", emoji: "💧" },
  fire: { label: "火焰", emoji: "🔥" },
  leaf: { label: "叶子", emoji: "🍃" },
  heart: { label: "爱心", emoji: "💗" },
  skull: { label: "骷髅", emoji: "💀" },
};

const RESULT_TEXT: Record<string, string> = {
  defused: "拆弹成功",
  boom: "炸弹爆炸",
  timeout: "时间到",
};

function two(n: number) {
  return n < 10 ? "0" + n : String(n);
}

function clock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${two(Math.floor(total / 60))}:${two(total % 60)}`;
}

export function BombSquadStage(props: StageProps) {
  const { room, seat, game, act, meta, now } = props;
  const d = game.data;
  const t = useNow(now, d.phase !== "over", 250);

  const isDefuser = seat === d.defuser;
  const defuserName = (room.seats?.[d.defuser]?.profile?.nickname as string) || "TA";
  const remainMs = Math.max(0, (d.deadline || 0) - t);
  const urgent = remainMs <= 60000;

  // 只在「失误 +1 / 模块 +1」时出声，不能每次广播都响。
  const seen = useRef({ strikes: d.strikes, solved: d.solved });
  useEffect(() => {
    const prev = seen.current;
    if (d.strikes > prev.strikes) sfx.wrong();
    else if (d.solved > prev.solved) sfx.correct();
    seen.current = { strikes: d.strikes, solved: d.solved };
  }, [d.strikes, d.solved]);

  return (
    <section className="stage bomb-stage">
      <div className="stage-topline">
        <span className="game-eyebrow">
          {meta.name} · {isDefuser ? "拆弹员" : "专家"}
        </span>
        <span className="round-chip">
          已拆 {d.solved} / {d.total}
        </span>
      </div>

      <div className="bomb-hud">
        <div className={"bomb-role " + (isDefuser ? "defuser" : "expert")}>
          <span className="bomb-role-emoji">{isDefuser ? "🧰" : "📖"}</span>
          <div className="bomb-role-copy">
            <b>{isDefuser ? "你是拆弹员" : "你是专家"}</b>
            <span>{isDefuser ? "把面板上的信息念给 TA 听" : "手册在你这儿，只动嘴不动手"}</span>
          </div>
        </div>
        <div className={"bomb-timer " + (urgent ? "urgent" : "")}>
          <b>{clock(remainMs)}</b>
          <span>剩余时间</span>
        </div>
        <div className="bomb-strikes">
          <div className="bomb-strike-dots">
            {Array.from({ length: d.maxStrikes || 0 }).map((_, i) => (
              <i key={i} className={i < d.strikes ? "lost" : ""} />
            ))}
          </div>
          <span>
            失误 <b>{d.strikes}</b> / {d.maxStrikes}
          </span>
        </div>
      </div>

      <div className="bomb-main">
        {isDefuser ? (
          <DefuserBoard d={d} act={act} />
        ) : (
          <ManualPanel d={d} defuserName={defuserName} />
        )}
      </div>

      <p className="stage-hint">
        {isDefuser
          ? "你能看到颜色、符号、序列号和电池数，但看不到手册——每一项都要问 TA。"
          : "序列号和电池数只有拆弹员能看到，问 TA；TA 也看不到手册，只能听你说。"}
      </p>
    </section>
  );
}

export const Stage = BombSquadStage;

/* ---------------- 拆弹员：炸弹面板 ---------------- */

function DefuserBoard({ d, act }: { d: any; act: StageProps["act"] }) {
  const modules: any[] = d.modules || [];
  const firstOpen = modules.find((m) => !m.done)?.id || modules[0]?.id || null;
  const [tab, setTab] = useState<string | null>(firstOpen);
  // 拆完当前模块（或状态从服务端刷新）后，自动跳到下一个没拆的
  useEffect(() => {
    if (!modules.some((m) => m.id === tab && !m.done)) setTab(firstOpen);
  }, [modules, tab, firstOpen]);
  const current = modules.some((m) => m.id === tab) && !modules.find((m) => m.id === tab)?.done ? tab : firstOpen;

  return (
    <div className="bomb-board">
      <div className="bomb-plate">
        <div className="bomb-plate-item">
          <span>序列号</span>
          <b className="bomb-serial">{d.serial}</b>
        </div>
        <div className="bomb-plate-item">
          <span>电池</span>
          <b className="bomb-batteries">
            {Array.from({ length: d.batteries || 0 }).map((_, i) => (
              <i key={i} aria-hidden="true">
                🔋
              </i>
            ))}
            <em>× {d.batteries}</em>
          </b>
        </div>
      </div>

      {/* 手机上模块叠起来太长，用标签一次只看一个；宽屏三个并排，标签隐藏 */}
      <div className="bomb-tabs" role="tablist" aria-label="炸弹模块">
        {modules.map((m) => (
          <button
            type="button"
            key={m.id}
            role="tab"
            aria-selected={m.id === current}
            disabled={!!m.done}
            className={
              "bomb-tab" + (m.id === current ? " active" : "") + (m.done ? " done" : "")
            }
            onClick={() => setTab(m.id)}
          >
            {m.done ? "✓ " : ""}
            {m.title}
          </button>
        ))}
      </div>

      <div className="bomb-modules">
        {modules.map((m: any) => (
          <div
            className={
              "bomb-module" + (m.done ? " done" : "") + (m.id === current ? " active" : "")
            }
            key={m.id}
          >
            <div className="bomb-module-head">
              <b>{m.title}</b>
              {m.done && <span className="bomb-check">✓ 已拆</span>}
            </div>

            {!m.done && m.type === "wires" && (
              <>
                <p className="bomb-module-tip">报给 TA：一共几根线，从左到右每根是什么颜色。</p>
                <div className="bomb-wires">
                  {(m.wires || []).map((color: string, i: number) => (
                    <button
                      type="button"
                      key={i}
                      className={"bomb-wire " + (color === "白" ? "light" : "")}
                      style={{ ["--wire" as string]: WIRE_COLORS[color] || "#888" }}
                      title={`剪第 ${i + 1} 根（${color}）`}
                      onClick={() => {
                        sfx.click();
                        act({ type: "cut", module: m.id, index: i });
                      }}
                    >
                      <span className="bomb-wire-inner">
                        <span className="bomb-wire-line" />
                        <span className="bomb-wire-no">{i + 1}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {!m.done && m.type === "symbols" && (
              <>
                <p className="bomb-module-tip">报给 TA：面板上有哪 4 个符号。</p>
                <div className="bomb-symbols">
                  <div className="bomb-progress">
                    {Array.from({ length: (m.symbols || []).length }).map((_, i) => {
                      const key = m.progress?.[i];
                      return (
                        <span key={i} className={"bomb-slot " + (key ? "filled" : "")}>
                          {key ? SYMBOLS[key]?.emoji || "·" : "·"}
                        </span>
                      );
                    })}
                    <em>{`${m.progress?.length || 0} / ${(m.symbols || []).length}`}</em>
                  </div>
                  <div className="bomb-symbol-grid">
                    {(m.symbols || []).map((s: any) => (
                      <button
                        type="button"
                        key={s.key}
                        className="bomb-symbol"
                        onClick={() => {
                          sfx.tap();
                          act({ type: "press", module: m.id, symbol: s.key });
                        }}
                      >
                        <span>{s.emoji}</span>
                        <b>{s.label}</b>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {!m.done && m.type === "switches" && (
              <>
                <p className="bomb-module-tip">报给 TA：三个开关现在各自朝上还是朝下。</p>
                <div className="bomb-switches">
                  {(m.switches || []).map((sw: any, i: number) => (
                  <button
                    type="button"
                    key={sw.label}
                    className={"bomb-switch " + (sw.up ? "up" : "down")}
                    onClick={() => {
                      sfx.flip();
                      act({ type: "toggle", module: m.id, index: i });
                    }}
                  >
                    <span className="bomb-switch-track">
                      <i />
                    </span>
                    <span className="bomb-switch-label">
                      <b>{sw.label}</b>
                      <em>{sw.up ? "朝上" : "朝下"}</em>
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  className="primary small bomb-confirm"
                  onClick={() => {
                    sfx.tap();
                    act({ type: "submit", module: m.id });
                  }}
                >
                  确认
                </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- 专家：拆弹手册 ---------------- */

function ManualPanel({ d, defuserName }: { d: any; defuserName: string }) {
  const manual = d.manual;
  return (
    <div className="bomb-manual">
      <div className="bomb-manual-top">
        <b>📖 拆弹手册</b>
        <span className="bomb-manual-warn">{`只动嘴，不动手 · 让 ${defuserName} 来按`}</span>
      </div>
      <p className="bomb-manual-intro">{manual?.intro}</p>

      <div className="bomb-manual-status">
        {(d.modules || []).map((m: any) => (
          <span key={m.id} className={"bomb-status " + (m.done ? "done" : "")}>
            {m.done ? "✓ " : "○ "}
            {m.title}
          </span>
        ))}
      </div>

      {(manual?.sections || []).map((section: any) => (
        <section className={"bomb-manual-section s-" + section.type} key={section.type}>
          <header>
            <span className="bomb-manual-icon">{section.icon}</span>
            <b>{section.title}</b>
            {section.note && <em>{section.note}</em>}
          </header>
          {section.groups.map((group: any, gi: number) => (
            <div className="bomb-group" key={gi}>
              <span className="bomb-when">{group.when}</span>
              <ul>
                {group.items.map((item: string, ii: number) => (
                  <li key={ii}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}

      <p className="bomb-manual-foot">序列号和电池数只有拆弹员能看到，问 TA。</p>
    </div>
  );
}

/* ---------------- 结算补充 ---------------- */

export function ResultExtra({ game }: ResultExtraProps) {
  const d = game.data;
  const seconds = Math.max(0, Math.round(((d.endedAt || 0) - (d.startedAt || 0)) / 1000));
  const result = RESULT_TEXT[d.result] || "结束了";
  return (
    <>
      <p className={"bomb-result " + (d.result || "")}>{result}</p>
      <div className="result-stats">
        <div>
          <strong>
            {d.solved} / {d.total}
          </strong>
          <span>拆掉模块</span>
        </div>
        <div>
          <strong>{d.strikes}</strong>
          <span>失误次数</span>
        </div>
        <div>
          <strong>{seconds}s</strong>
          <span>用时</span>
        </div>
      </div>
      <p className="result-note">
        {d.result === "defused"
          ? "三个模块全部拆掉，配合得漂亮。"
          : d.result === "boom"
            ? "失误用完了，下次先把序列号和电池数念清楚。"
            : "时间到了，先挑最短的那本手册读。"}
      </p>
    </>
  );
}
