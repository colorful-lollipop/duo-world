import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { StageProps, ResultExtraProps } from "./types";
import "./hanabi.css";

type Color = "red" | "yellow" | "green" | "blue" | "white";
type Card = { id: string; color?: Color; rank?: number; knowledge: { colors: Color[]; ranks: number[] } };
const COLORS: Color[] = ["red", "yellow", "green", "blue", "white"];
const COLOR: Record<Color, { name: string; ink: string; symbol: string }> = {
  red: { name: "红", ink: "#ad3a56", symbol: "♥" },
  yellow: { name: "黄", ink: "#90620c", symbol: "☀" },
  green: { name: "绿", ink: "#28734e", symbol: "✿" },
  blue: { name: "蓝", ink: "#356baf", symbol: "◆" },
  white: { name: "白", ink: "#6c6083", symbol: "✦" },
};
const colorStyle = (color: Color) => ({ "--hanabi-ink": COLOR[color].ink }) as CSSProperties;
const clueText = (clue: { kind: "color" | "rank"; value: Color | number }) => clue.kind === "color" ? `${COLOR[clue.value as Color].name}色` : `数字 ${clue.value}`;
function Fireworks({ stacks }: { stacks: Record<Color, number> }) {
  return <div className="hanabi-fireworks" aria-label="已完成的烟花">
    {COLORS.map(color => <div className="hanabi-stack" key={color} style={colorStyle(color)}>
      <span>{COLOR[color].symbol} {COLOR[color].name}</span><strong>{stacks[color]}</strong>
      <div className="hanabi-progress" aria-hidden="true">{[1, 2, 3, 4, 5].map(n => <i className={n <= stacks[color] ? "lit" : ""} key={n} />)}</div>
      <small>{stacks[color] === 5 ? "已绽放" : `下一张 ${stacks[color] + 1}`}</small>
    </div>)}
  </div>;
}

export const Stage = ({ room, seat, game, meta, act }: StageProps) => {
  const d = game.data;
  const other = 1 - seat;
  const own: Card[] = d.hands[seat];
  const partner: Card[] = d.hands[other];
  const [selected, setSelected] = useState<string | null>(null);
  const [clue, setClue] = useState<{ kind: "color" | "rank"; value: Color | number } | null>(null);
  const connected = room.seats.every(s => s.connected);
  const myTurn = d.turn === seat;
  const canAct = myTurn && connected && d.phase === "playing";
  const name = room.seats[other].profile?.nickname || "TA";
  useEffect(() => { setSelected(null); setClue(null); }, [game.run, d.turnNumber, connected]);
  const matches = (card: Card) => !!clue && (clue.kind === "color" ? card.color === clue.value : card.rank === clue.value);
  const matchCount = clue ? partner.filter(matches).length : 0;
  const selectedIndex = own.findIndex(card => card.id === selected);
  const move = (type: "play" | "discard") => {
    if (canAct && selectedIndex >= 0) act({ type, cardId: selected, turnNumber: d.turnNumber, run: game.run });
  };
  return <section className="stage hanabi-stage">
    <div className="stage-topline"><span className="game-eyebrow">{meta.emoji} {meta.name}</span><span className="round-chip">一起点亮 {d.score} / 25</span></div>
    <div className="hanabi-hud"><span>💡 提示 <b>{d.hints}/8</b></span><span>🕯️ 容错 <b>{d.fuses}/3</b></span><span>🎴 牌堆 <b>{d.deckCount}</b></span></div>
    <div className={`hanabi-turn ${canAct ? "is-mine" : ""}`} role="status">
      {!connected ? "等伴侣重新连接，牌局会留在这里" : myTurn ? "轮到你啦 · 提示、打出或弃掉一张" : `轮到 ${name} · 想想你们的下一步`}
      {d.finalTurns !== null && <small>最后一轮 · 还剩 {d.finalTurns} 次行动</small>}
    </div>
    <Fireworks stacks={d.fireworks} />
    <section className="hanabi-hand-section" aria-label="伴侣的手牌">
      <div className="hanabi-section-heading"><h3>{name} 的手牌</h3><span>你看得见，TA 看不见</span></div>
      <div className="hanabi-hand">{partner.map((card, index) => <div key={card.id} className={`hanabi-card hanabi-face ${matches(card) ? "clue-match" : ""}`} style={colorStyle(card.color!)} aria-label={`第 ${index + 1} 张：${COLOR[card.color!].name}色 ${card.rank}${matches(card) ? "，本次提示选中" : ""}`}>
        <span className="hanabi-card-position">{index + 1}</span><strong>{card.rank}</strong><span>{COLOR[card.color!].symbol} {COLOR[card.color!].name}</span>
      </div>)}</div>
      <div className="hanabi-clues" aria-label="选择给伴侣的提示">
        <span className="hanabi-clue-caption">提示颜色</span><div className="hanabi-clue-row">{COLORS.map(color => {
          const count = partner.filter(c => c.color === color).length;
          return <button type="button" key={color} style={colorStyle(color)} disabled={!canAct || !d.hints || !count} className={clue?.kind === "color" && clue.value === color ? "selected" : ""} aria-pressed={clue?.kind === "color" && clue.value === color} onClick={() => { setClue({ kind: "color", value: color }); setSelected(null); }}>{COLOR[color].symbol} {COLOR[color].name}<small>×{count}</small></button>;
        })}</div>
        <span className="hanabi-clue-caption">提示数字</span><div className="hanabi-clue-row">{[1, 2, 3, 4, 5].map(rank => {
          const count = partner.filter(c => c.rank === rank).length;
          return <button type="button" key={rank} disabled={!canAct || !d.hints || !count} className={clue?.kind === "rank" && clue.value === rank ? "selected" : ""} aria-pressed={clue?.kind === "rank" && clue.value === rank} onClick={() => { setClue({ kind: "rank", value: rank }); setSelected(null); }}>{rank}<small>×{count}</small></button>;
        })}</div>
      </div>
      <button type="button" className="hanabi-confirm" disabled={!canAct || !d.hints || !clue || !matchCount} onClick={() => clue && act({ type: "hint", ...clue, turnNumber: d.turnNumber, run: game.run })}>{clue ? `告诉 TA：这 ${matchCount} 张是${clueText(clue)} · 消耗 1 提示` : d.hints ? "先选颜色或数字，再确认提示" : "提示用完啦 · 可以弃牌补充"}</button>
    </section>
    <section className="hanabi-hand-section" aria-label="你的手牌">
      <div className="hanabi-section-heading"><h3>你的手牌</h3><span>只显示 TA 告诉你的线索</span></div>
      <div className="hanabi-hand">{own.map((card, index) => <button type="button" key={card.id} className={`hanabi-card hanabi-back ${selected === card.id ? "chosen" : ""}`} disabled={!canAct} aria-pressed={selected === card.id} aria-label={`选择第 ${index + 1} 张，可能颜色：${card.knowledge.colors.map(c => COLOR[c].name).join("、")}，可能数字：${card.knowledge.ranks.join("、")}`} onClick={() => { setSelected(selected === card.id ? null : card.id); setClue(null); }}>
        <span className="hanabi-card-position">{index + 1}</span><strong>{card.knowledge.ranks.length === 1 ? card.knowledge.ranks[0] : "?"}</strong>
        <span className="hanabi-knowledge-colors">{card.knowledge.colors.length === 5 ? "颜色未知" : card.knowledge.colors.map(c => COLOR[c].name).join("·")}</span><small>{card.knowledge.ranks.length === 5 ? "数字未知" : card.knowledge.ranks.join(" / ")}</small>
      </button>)}</div>
      <div className="hanabi-actions"><button type="button" disabled={!canAct || selectedIndex < 0} onClick={() => move("play")}>🎆 打出{selectedIndex < 0 ? "所选牌" : `第 ${selectedIndex + 1} 张`}</button><button type="button" disabled={!canAct || selectedIndex < 0 || d.hints >= 8} onClick={() => move("discard")}>♻ 弃牌 · 提示 +1</button></div>
      <p className="hanabi-note">{d.hints >= 8 ? "提示已满，不能弃牌。打出前，先看看烟花还缺几号。" : "选一张牌再行动。打错会消耗容错；弃掉的牌不能拿回来。"}</p>
    </section>
    <details className="hanabi-details"><summary>📖 第一次玩？一起看规则</summary><ul>
      <li>你们是队友！每人 5 张牌，只能看见对方的牌。靠有限提示，一起完成五色烟花。</li>
      <li>每种颜色都要从 1 按顺序打到 5。打出不符合顺序的牌会弃掉它并消耗 1 次容错；容错用完立即结束。</li>
      <li>每回合只选一项：给提示、打出一张牌、或弃掉一张牌。提示必须指出对方手中某颜色或数字的全部匹配牌；其余牌也会记下排除信息。</li>
      <li>提示消耗 1 点；弃牌或完成一色的 5，恢复 1 点，上限 8。提示满时不能弃牌。每种颜色的 1 有 3 张，2 / 3 / 4 各 2 张，5 只有 1 张。</li>
      <li>打出或弃掉后自动补牌。抽走最后一张后，每人再行动一次；五色全满则立即以 25 分结束。</li>
      <li>自己的牌上显示的是收到提示后仍可能的颜色和数字，不是自动算出的答案。别在聊天里直接报出彼此的手牌哦。</li>
    </ul><a href="/licenses/Hanabi.txt" target="_blank" rel="noreferrer">开源来源与 MIT 许可</a></details>
    <details className="hanabi-details"><summary>🗂 弃牌区 · {d.discard.length} 张</summary><div className="hanabi-discards">{COLORS.map(color => <span key={color} style={colorStyle(color)}>{COLOR[color].symbol} {COLOR[color].name}：{d.discard.filter((c: Card) => c.color === color).map((c: Card) => c.rank).sort((a: number, b: number) => a - b).join("、") || "暂无"}</span>)}</div></details>
    <details className="hanabi-details"><summary>💬 最近行动</summary><ol className="hanabi-log">{d.log.length ? [...d.log].reverse().map((line: string, i: number) => <li key={i}>{line}</li>) : <li>烟花还未点亮，先给彼此一点提示吧。</li>}</ol></details>
  </section>;
};

export const ResultExtra = ({ game }: ResultExtraProps) => <div className="hanabi-result"><p>这一场，我们一起点亮了 <b>{game.data.score} / 25</b> 分的夜空。</p><Fireworks stacks={game.data.fireworks} /><p>没有输赢对手，只有越来越懂彼此的你们。</p><a href="/licenses/Hanabi.txt" target="_blank" rel="noreferrer">开源来源与许可</a></div>;
