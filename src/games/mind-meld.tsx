import { useEffect, useState } from "react";
import "./mind-meld.css";
import type { ResultExtraProps, StageProps } from "./types";
import { Critter } from "../components/Critter";
import { useNow } from "../lib/useNow";
import { sfx } from "../lib/sound";

export function MindMeldStage(props: StageProps) {
  const { room, seat, game, act, now } = props;
  const d = game.data;
  const t = useNow(now, d.phase !== "over", 200);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setWord("");
    setBusy(false);
  }, [d.round, game.run]);

  const revealed = d.phase === "reveal" && t >= (d.revealAt || 0);
  const mySubmitted = !!d.submitted?.[seat];
  const other = 1 - seat;
  const otherSubmitted = !!d.submitted?.[other];

  useEffect(() => {
    if (d.phase === "reveal" && d.lastGain > 0) sfx.correct();
    else if (d.phase === "reveal") sfx.tap();
  }, [d.phase, d.round, d.lastGain]);

  const thought = (n: number) => {
    if (d.phase === "reveal" && revealed) return d.answers?.[n] || "…";
    if (d.submitted?.[n]) return n === seat ? d.submitted?.[n] : "写好了";
    return "…";
  };

  return (
    <section className="stage mind-stage">
      <div className="stage-topline">
        <span className="game-eyebrow">把两个念头，慢慢变成一条线</span>
        <span className="round-chip">
          第 {Math.min(d.round + 1, d.maxRounds)} / {d.maxRounds} 轮
        </span>
      </div>

      <div className="mind-duo">
        {[seat, other].map((n, i) => {
          const p = room.seats[n]?.profile;
          return (
            <div className={"mind-head " + (i ? "right" : "")} key={n}>
              <span
                className={
                  "thought " +
                  (revealed ? "shown" : d.submitted?.[n] ? "done" : "") +
                  (revealed && d.lastGain > 0 ? " bright" : "")
                }
              >
                {thought(n)}
              </span>
              <Critter
                avatar={p?.avatar}
                color={p?.color}
                mood={revealed ? (d.lastGain > 0 ? "joy" : "wow") : d.submitted?.[n] ? "joy" : "normal"}
                size={84}
                className={!d.submitted?.[n] ? "hop" + (i ? " late" : "") : ""}
              />
              <span className="name-tag" style={{ ["--player" as string]: p?.color }}>
                {n === seat ? "你" : p?.nickname || "TA"}
              </span>
            </div>
          );
        })}
      </div>

      <div className="word-chain">
        {d.history.map((h: any, i: number) => (
          <div
            className={"word-pair " + (h.matched ? "matched" : "") + (i === d.history.length - 1 ? " latest" : "")}
            key={i}
          >
            <span>{h.a}</span>
            <i>{h.matched ? "💗" : "·"}</i>
            <span>{h.b}</span>
          </div>
        ))}
      </div>

      <div className="mind-body">
        {d.phase === "submit" && (
          <form
            className="mind-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!word.trim() || busy || mySubmitted) return;
              setBusy(true);
              sfx.send();
              act({ type: "submit", word });
              setBusy(false);
            }}
          >
            <label className="field">
              <span>{mySubmitted ? "你写好了，等 TA 一起揭晓" : "你的联想词"}</span>
              <input
                value={word}
                onChange={(e) => setWord(e.target.value)}
                maxLength={12}
                placeholder={d.round ? "和上面两个词都有关的词" : "写下第一个想到的词"}
                disabled={mySubmitted || busy}
                autoFocus
              />
            </label>
            <p className="small-print muted">1–12 个字，不能和之前的词重复。慢慢想，TA 看不到你写了什么。</p>
            <button className="primary wide" disabled={!word.trim() || mySubmitted}>
              {mySubmitted ? "等 TA 写好啦" : "写好了，一起揭晓"}
            </button>
            {otherSubmitted && !mySubmitted && <p className="waiting-note">TA 已经写好了，答案先替你保密。</p>}
          </form>
        )}

        {d.phase === "reveal" && (
          <div className="mind-reveal">
            {!revealed ? (
              <p className="reveal-wait">两句话正飘到一起…</p>
            ) : (
              <>
                <div className={"reveal-badge " + (d.lastGain > 0 ? "good" : "")}>
                  {d.lastGain > 0 ? "心有灵犀 +1" : d.roundMatched ? "这次想法一样！" : "这次不太一样"}
                </div>
                {!d.roundMatched && (
                  <div className="agreement">
                    <p>意思相近的话，两个人都确认，也算心有灵犀。</p>
                    <button
                      className={"secondary " + (d.agrees?.[seat] ? "active" : "")}
                      disabled={!!d.agrees?.[seat]}
                      onClick={() => {
                        sfx.reaction();
                        act({ type: "agree" });
                      }}
                    >
                      {d.agrees?.[seat] ? "等 TA 也确认" : "算我们心有灵犀"}
                    </button>
                    {d.agrees?.[other] && <span className="waiting-note">TA 觉得你们想的一样，你呢？</span>}
                  </div>
                )}
                <button
                  className="primary wide"
                  onClick={() => {
                    sfx.tap();
                    act({ type: "next" });
                  }}
                >
                  {d.round + 1 >= d.maxRounds ? "看看我们的词链" : "下一轮"}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <p className="stage-hint">
        目前灵犀了 <b>{d.matched}</b> 次
        {d.submitted?.[other] && d.phase === "submit" ? " · TA 已写好" : ""}
      </p>
    </section>
  );
}

export const Stage = MindMeldStage;

export function ResultExtra({ game }: ResultExtraProps) {
  const d = game.data;
  return (
    <>
      <div className="result-stats">
        <div>
          <strong>{d.matched}</strong>
          <span>次心有灵犀</span>
        </div>
        <div>
          <strong>{d.history.length}</strong>
          <span>轮词链</span>
        </div>
      </div>
      <div className="chain result-chain">
        {d.history.map((h: any, i: number) => (
          <div className={"word-pair " + (h.matched ? "matched" : "")} key={i}>
            <span>{h.a}</span>
            <i>·</i>
            <span>{h.b}</span>
          </div>
        ))}
      </div>
    </>
  );
}