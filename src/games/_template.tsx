// 模板：新游戏的界面。
// 复制成 src/games/<id>.tsx（文件名 = 游戏 id，与 shared/games/<id>.json 一致）。
// Vite 会把它拆成独立 chunk，只有开局才下载这一款游戏的代码。
//
// 导出约定：
// - `export const Stage`：游戏进行中的界面（必填）
// - `export const ResultExtra`：结算页的补充内容（可选）
// 结算页本身由 GameStageHost 统一渲染，这里不需要处理 phase === "over"。
import { useState } from "react";
import type { StageProps } from "./types";

export function MyGameStage(props: StageProps) {
  const { room, seat, game, act, meta } = props;
  const d = game.data;
  const [local, setLocal] = useState(0);

  return (
    <section className="stage">
      <div className="stage-topline">
        <span className="game-eyebrow">{meta.name}</span>
        <span className="round-chip">
          第 {Math.min(d.round + 1, d.rounds)} / {d.rounds} 轮
        </span>
      </div>
      <h2>{meta.tagline}</h2>
      <p className="muted">分数：{d.score}</p>
      <button
        className="primary"
        onClick={() => {
          setLocal(local + 1);
          act({ type: "tap" });
        }}
      >
        点一下
      </button>
      <p className="stage-hint">规则说明可以放在这里。</p>
    </section>
  );
}

export const Stage = MyGameStage;

export function ResultExtra({ game }: any) {
  const d = game.data;
  return <p className="result-note">这一局你们拿到了 {d.score} 分。</p>;
}
