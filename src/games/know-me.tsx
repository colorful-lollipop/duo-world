import { useEffect, useState } from "react";
import "./know-me.css";
import type { ResultExtraProps, StageProps } from "./types";
import { answerText } from "./types";
import { Critter } from "../components/Critter";
import { useNow } from "../lib/useNow";
import { sfx } from "../lib/sound";

export function KnowMeStage(props: StageProps) {
  const { room, seat, game, act, now } = props;
  const d = game.data;
  const t = useNow(now, d.phase === "reveal", 180);
  const [value, setValue] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const isHero = d.hero === seat;
  const heroProfile = room.seats[d.hero]?.profile;
  const q = d.question;
  const meSubmitted = !!d.submitted?.[seat];
  const otherSubmitted = !!d.submitted?.[1 - seat];
  const revealReady = d.phase === "reveal" && t >= (d.revealAt || 0);
  const showAnswers = d.phase === "revealed" || revealReady;

  useEffect(() => {
    if (!q) return;
    if (q.type === "slider" || q.type === "scale") setValue(50);
    else if (q.type === "choice") setValue(null);
    else setValue("");
    setBusy(false);
  }, [d.idx, game.run, q?.id]);

  useEffect(() => {
    if (d.phase === "revealed" && d.lastScore === 10) sfx.correct();
    else if (d.phase === "revealed" && d.lastScore === 0) sfx.wrong();
    else if (d.phase === "reveal" && revealReady) sfx.tap();
  }, [d.phase, revealReady, d.idx, d.lastScore]);

  const submit = () => {
    if (busy || meSubmitted) return;
    if (q.type === "choice" && value === null) return;
    if (q.type === "text" && !String(value || "").trim()) return;
    setBusy(true);
    sfx.send();
    act({ type: "submit", answer: q.type === "text" ? String(value) : Number(value) });
    setBusy(false);
  };

  const canSubmit =
    q.type === "choice" ? value !== null : q.type === "text" ? !!String(value || "").trim() : value !== null;

  return (
    <section className="stage know-stage">
      <div className="stage-topline">
        <span className="game-eyebrow">
          第 {d.idx + 1} / {d.total} 题 · 主角是 <b>{heroProfile?.nickname || "TA"}</b>
        </span>
        <span className="round-chip">{q.category}</span>
      </div>
      <div className="progress-track" aria-hidden="true">
        <span style={{ width: `${((d.idx + 1) / d.total) * 100}%` }} />
      </div>

      <div className="question-board">
        <Critter
          avatar={heroProfile?.avatar}
          color={heroProfile?.color}
          mood={showAnswers ? "wow" : "joy"}
          size={72}
          className="question-hero"
        />
        <h2>
          {String(q.text).replace(/\s*\{name\}\s*/g, isHero ? "你" : heroProfile?.nickname || "TA")}
        </h2>
        <p className="muted">
          {isHero ? "答你自己的真实情况，让 TA 更懂你。" : "猜猜 TA 会怎么回答，也可以先交卷。"}
        </p>
      </div>

      {d.phase === "reveal" && !revealReady ? (
        <p className="reveal-wait">两边的答案正一起翻开…</p>
      ) : showAnswers ? (
        <div className="know-reveal">
          <div className="answer-pair">
            {[0, 1].map((n) => {
              const isHeroSeat = n === d.hero;
              const p = room.seats[n]?.profile;
              return (
                <article key={n} className={isHeroSeat ? "truth" : "guess"}>
                  <header>
                    <Critter avatar={p?.avatar} color={p?.color} size={32} shadow={false} />
                    <small>
                      {n === seat ? "你" : p?.nickname || "TA"} · {isHeroSeat ? "的答案" : "的猜测"}
                    </small>
                  </header>
                  <strong className={q.type === "text" ? "long" : ""}>
                    {answerText(q, d.answers?.[n])}
                  </strong>
                  {q.type === "scale" && (
                    <div className="scale-answer-mini">
                      <span>{q.left}</span>
                      <i style={{ width: `${d.answers?.[n] || 0}%` }} />
                      <span>{q.right}</span>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {d.phase === "reveal" ? (
            isHero ? (
              <div className="grade-box">
                <p>TA 猜得怎么样？</p>
                <div className="button-row">
                  <button className="secondary" onClick={() => act({ type: "grade", score: 10 })}>
                    完全懂我 +10
                  </button>
                  <button className="secondary" onClick={() => act({ type: "grade", score: 5 })}>
                    差不多 +5
                  </button>
                  <button className="secondary" onClick={() => act({ type: "grade", score: 0 })}>
                    完全没猜到 +0
                  </button>
                </div>
              </div>
            ) : (
              <p className="waiting-note">等 {heroProfile?.nickname || "TA"} 来给这道题判分…</p>
            )
          ) : (
            <div className="know-score">
              <span className="last-score">这一题 +{d.lastScore ?? 0}</span>
              <button
                className="primary"
                onClick={() => {
                  sfx.tap();
                  act({ type: "next" });
                }}
              >
                {d.idx + 1 >= d.total ? "看看默契指数" : "下一题"} →
              </button>
            </div>
          )}
        </div>
      ) : (
        <form
          className="know-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {q.type === "choice" && (
            <div className="choice-grid">
              {q.options.map((opt: string, i: number) => (
                <button
                  type="button"
                  key={opt}
                  className={"choice " + (value === i ? "selected" : "")}
                  aria-pressed={value === i}
                  disabled={meSubmitted}
                  onClick={() => {
                    sfx.tap();
                    setValue(i);
                  }}
                >
                  <span>{String.fromCharCode(65 + i)}</span>
                  {opt}
                </button>
              ))}
            </div>
          )}

          {q.type === "scale" && (
            <label className="range-answer">
              <strong>{value ?? 50}</strong>
              <input
                type="range"
                min={0}
                max={100}
                value={value ?? 50}
                disabled={meSubmitted}
                onChange={(e) => setValue(Number(e.target.value))}
                aria-label="你的评分"
              />
              <span className="range-labels">
                <span>{q.left}</span>
                <span>{q.right}</span>
              </span>
            </label>
          )}

          {q.type === "text" && (
            <label className="field">
              <span>{isHero ? "你的答案" : "你猜 TA 会写什么"}</span>
              <textarea
                rows={3}
                maxLength={120}
                value={value || ""}
                disabled={meSubmitted}
                onChange={(e) => setValue(e.target.value)}
                placeholder={isHero ? "写下心里的答案…" : "猜猜 TA 会怎么答…"}
              />
            </label>
          )}

          <button className="primary wide" disabled={meSubmitted || !canSubmit || busy}>
            {meSubmitted ? "已锁定，等 TA 一起揭晓" : "锁定我的答案"}
          </button>
          {otherSubmitted && !meSubmitted && <p className="waiting-note">TA 已经答好了，答案先保密。</p>}
          {meSubmitted && otherSubmitted && <p className="waiting-note">两边都答好啦，马上一起翻开。</p>}
        </form>
      )}

      <p className="stage-hint">没有标准答案，猜错正好聊一聊：原来你是这么想的。</p>
    </section>
  );
}

export const Stage = KnowMeStage;

export function ResultExtra({ game }: ResultExtraProps) {
  const d = game.data;
  const pct = d.total ? Math.round((d.score / (d.total * 10)) * 100) : 0;
  const message =
    pct >= 90
      ? "你们几乎共用同一个脑袋。"
      : pct >= 70
        ? "很懂彼此，也有可爱的小偏差。"
        : pct >= 50
          ? "一半靠了解，一半靠猜。"
          : "原来还有这么多没来得及知道。";
  return (
    <>
      <div className="compat-score">
        <div className="compat-ring" style={{ ["--pct" as string]: pct }}>
          <strong>{pct}%</strong>
          <span>默契指数</span>
        </div>
        <p>{message}</p>
      </div>
      <div className="result-stats">
        <div>
          <strong>{d.score}</strong>
          <span>总得分</span>
        </div>
        <div>
          <strong>{d.total}</strong>
          <span>道关于彼此的题</span>
        </div>
      </div>
    </>
  );
}