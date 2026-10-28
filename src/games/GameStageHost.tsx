import { useEffect, useState } from "react";
import { GAME_MAP, type GameState, type RoomState } from "../types";
import { getCachedGameModule, loadGameModule } from "./registry";
import type { StageModule } from "./types";
import { GameResult } from "../components/GameResult";
import { Icon } from "../components/Icon";

interface GameStageHostProps {
  room: RoomState;
  seat: number;
  game: GameState;
  act: (action: Record<string, unknown>) => boolean;
  send: (msg: Record<string, unknown>) => boolean;
  now: () => number;
  subscribe: (fn: (msg: any) => void) => () => void;
  onRestart: () => void;
  onExit: () => void;
}

/**
 * 游戏舞台的唯一入口：
 * - 按需加载 src/games/<id>.tsx
 * - 统一处理结算页（phase === "over"）
 * - 游戏自己的结算补充内容通过模块的 ResultExtra 提供
 *
 * 加新游戏不需要改这里，也不需要改 RoomPage。
 */
export function GameStageHost(props: GameStageHostProps) {
  const { room, seat, game, act, send, now, subscribe, onRestart, onExit } = props;
  const meta = GAME_MAP[game.id];
  const [loaded, setLoaded] = useState<{ id: string; module: StageModule } | null>(() => {
    const cached = getCachedGameModule(game.id);
    return cached ? { id: game.id, module: cached } : null;
  });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (loaded?.id === game.id) return;
    let live = true;
    setFailed(false);
    loadGameModule(game.id)
      .then((module) => {
        if (live) setLoaded({ id: game.id, module });
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [game.id, loaded?.id]);

  if (!meta) {
    return (
      <div className="stage game-loading">
        <span className="game-loading-emoji">🧩</span>
        <h2>这个游戏没有登记</h2>
        <p className="muted">shared/games.json 里找不到 {game.id}，检查一下构建产物是不是旧版本。</p>
        <button className="secondary" onClick={onExit}>
          <Icon name="home" size={17} /> 回大厅
        </button>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="stage game-loading">
        <span className="game-loading-emoji">🛠️</span>
        <h2>「{meta.name}」没加载起来</h2>
        <p className="muted">可能是网络抖动，也可能是这个游戏的界面文件缺失。回大厅再试一次吧。</p>
        <button className="secondary" onClick={onExit}>
          <Icon name="home" size={17} /> 回大厅
        </button>
      </div>
    );
  }

  if (!loaded || loaded.id !== game.id) {
    return (
      <div className="stage game-loading">
        <span className="spinner" />
        <h2>正在打开「{meta.name}」…</h2>
        <p className="muted">只加载这一款游戏的代码，很快就好。</p>
      </div>
    );
  }

  const stageProps = { room, seat, game, meta, act, send, now, subscribe };

  if (game.data.phase === "over") {
    const Extra = loaded.module.ResultExtra;
    return (
      <GameResult meta={meta} room={room} onRestart={onRestart} onExit={onExit}>
        {Extra && <Extra room={room} seat={seat} game={game} meta={meta} />}
      </GameResult>
    );
  }

  const Stage = loaded.module.Stage;
  return <Stage {...stageProps} />;
}