import { useEffect, useState } from "react";
import type { ResultExtraProps, StageProps } from "./types";
import { Critter } from "../components/Critter";
import { Modal } from "../components/Modal";
import { Icon } from "../components/Icon";
import { useNow } from "../lib/useNow";
import { sfx } from "../lib/sound";

const DECK_LABEL: Record<string, string> = {
  轻松: "🍬 轻松一点",
  走心: "🌙 走近一点",
  未来: "🔮 想远一点",
  小挑战: "🎲 给抽卡人的小挑战",
};

export function TalkCardsStage(props: StageProps) {
  const { room, seat, game, act, now } = props;
  const d = game.data;
  const t = useNow(now, true, 200);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const isTurn = d.turn === seat;
  const revealed = d.phase === "shown" && t >= d.flipAt;
  const turnProfile = room.seats[d.turn]?.profile;
  const myFavorites = d.favorites?.[seat] || [];
  const favorited = !!d.card && myFavorites.some((c: any) => c.id === d.card.id);

  useEffect(() => {
    if (revealed) sfx.flip();
  }, [revealed, d.card?.id]);

  return (
    <section className="stage talk-stage">
      <div className="stage-topline">
        <div className="turn-pill">
          {turnProfile && (
            <Critter avatar={turnProfile.avatar} color={turnProfile.color} size={30} mood={isTurn ? "joy" : "normal"} shadow={false} />
          )}
          <span>
            {isTurn ? "轮到你抽卡" : `轮到 ${turnProfile?.nickname || "TA"} 抽卡`} · 第 {d.idx + 1} 张
          </span>
        </div>
        <button className="text-button" onClick={() => setConfirmEnd(true)}>
          今天就聊到这儿
        </button>
      </div>

      <div className="talk-card-stage">
        <button
          className={"talk-card " + (revealed ? "is-revealed" : "") + (isTurn && d.phase === "draw" ? " can-draw" : "")}
          onClick={() => {
            if (!isTurn || d.phase !== "draw") return;
            sfx.tap();
            act({ type: "draw" });
          }}
          disabled={!isTurn || d.phase !== "draw"}
          aria-label={d.phase === "draw" ? (isTurn ? "抽一张卡" : "等对方抽卡") : "聊天卡"}
        >
          <div className="talk-card-inner">
            <div className="talk-card-face talk-card-back">
              <span className="card-moon" aria-hidden="true">
                🌙
              </span>
              <span className="card-stars" aria-hidden="true">
                ✦ · ✧ · ✦
              </span>
              <strong>深夜聊天卡</strong>
              <span className="card-back-hint">
                {d.phase === "shown" ? "正在一起翻开…" : isTurn ? "轻点卡片，开启一段对话" : "等 TA 抽一张卡"}
              </span>
              <span className="card-deck-tag">{DECK_LABEL[d.deck] || d.deck}</span>
            </div>
            <div className="talk-card-face talk-card-front">
              {d.card ? (
                <>
                  <span className="card-deck">{DECK_LABEL[d.card.deck] || d.card.deck}</span>
                  <p className="card-question">{d.card.text}</p>
                  <span className="card-foot">
                    {d.card.deck === "小挑战"
                      ? `${turnProfile?.nickname || "TA"}，轮到你啦`
                      : "没有标准答案，只想多懂你一点"}
                  </span>
                  <span className="card-index">第 {d.shownCount} 张</span>
                </>
              ) : null}
            </div>
          </div>
        </button>
      </div>

      <div className="talk-actions">
        {revealed && d.card ? (
          <>
            <button
              className="primary big"
              onClick={() => {
                sfx.tap();
                act({ type: "next" });
              }}
            >
              聊好了，下一张 <span aria-hidden="true">→</span>
            </button>
            <div className="talk-tools">
              <button
                className={"secondary small " + (favorited ? "active" : "")}
                onClick={() => {
                  sfx.reaction();
                  act({ type: "fav" });
                }}
                aria-pressed={favorited}
              >
                <Icon name="heart" size={17} filled={favorited} /> {favorited ? "已收进小本子" : "喜欢这张"}
              </button>
              <button
                className="secondary small"
                onClick={() => {
                  sfx.tap();
                  act({ type: "reroll" });
                }}
              >
                换一张
              </button>
            </div>
          </>
        ) : (
          <p className="stage-hint">慢慢聊，不着急。想跳过的问题，随时可以换一张。</p>
        )}
        {d.phase === "shown" && !revealed && <p className="stage-hint">3、2、1… 一起翻开</p>}
      </div>

      {confirmEnd && (
        <Modal title="今天就聊到这儿？" onClose={() => setConfirmEnd(false)}>
          <p className="modal-text">聊过的卡和收藏都会留在纪念册里，下次可以接着抽。</p>
          <div className="button-row">
            <button
              className="primary"
              onClick={() => {
                setConfirmEnd(false);
                act({ type: "finish" });
              }}
            >
              收好今天的话
            </button>
            <button className="secondary" onClick={() => setConfirmEnd(false)}>
              再聊一会儿
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

export const Stage = TalkCardsStage;

export function ResultExtra({ game }: ResultExtraProps) {
  const d = game.data;
  const favs = [...(d.favorites?.[0] || []), ...(d.favorites?.[1] || [])];
  return (
    <>
      <div className="result-stats">
        <div>
          <strong>{d.shownCount}</strong>
          <span>翻开过的卡</span>
        </div>
        <div>
          <strong>{favs.length}</strong>
          <span>收藏的卡</span>
        </div>
      </div>
      {favs.length > 0 && (
        <ul className="fav-list">
          {favs.slice(-4).map((c: any) => (
            <li key={c.id}>{c.text}</li>
          ))}
        </ul>
      )}
    </>
  );
}