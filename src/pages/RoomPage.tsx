import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GAMES, GAME_MAP, type AvatarId, type Profile, type RoomState } from "../types";
import { useRoom } from "../lib/useRoom";
import { ApiError, getRoomInfo, joinRoom, type PublicRoomInfo } from "../lib/api";
import {
  AVATARS,
  COLORS,
  clearToken,
  getToken,
  loadProfile,
  loadSound,
  saveProfile,
  saveSession,
  saveSound,
} from "../lib/storage";
import { copyText, timeAgo } from "../lib/browser";
import { buildRoomLink, getShareBase } from "../lib/config";
import { navigate } from "../lib/router";
import { setSoundEnabled, sfx } from "../lib/sound";
import { Scene } from "../components/Scene";
import { Couple, Critter, EmptySeat } from "../components/Critter";
import { ProfileForm } from "../components/ProfileForm";
import { GameSettings } from "../components/GameSettings";
import { ShareModal } from "../components/ShareModal";
import { Modal, Toast } from "../components/Modal";
import { Icon } from "../components/Icon";
import { GameStageHost } from "../games/GameStageHost";

export function RoomPage({ code }: { code: string }) {
  const [token, setToken] = useState<string | null>(() => getToken(code));

  const onInvalid = useCallback(() => {
    clearToken(code);
    setToken(null);
  }, [code]);

  if (!token) {
    return (
      <JoinScreen
        code={code}
        onJoined={(t) => {
          setToken(t);
        }}
      />
    );
  }

  return <LiveRoom key={token} code={code} token={token} onInvalid={onInvalid} />;
}

function JoinScreen({ code, onJoined }: { code: string; onJoined: (token: string) => void }) {
  const saved = useMemo(() => loadProfile(), []);
  const [info, setInfo] = useState<PublicRoomInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Profile | null>(saved);

  useEffect(() => {
    let live = true;
    getRoomInfo(code)
      .then((data) => {
        if (!live) return;
        setInfo(data);
        setLoading(false);
      })
      .catch((err) => {
        if (!live) return;
        setError(err instanceof ApiError ? err.message : "房间打不开了，再试一次吧");
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [code]);

  const host = info?.seats?.[0];
  const hostAvatar = (host?.avatar || "bunny") as AvatarId;
  const hostColor = host?.color || COLORS[0];
  const suggestedAvatar = AVATARS[(AVATARS.indexOf(hostAvatar) + 1) % AVATARS.length];
  const suggestedColor = COLORS[(Math.max(0, COLORS.indexOf(hostColor)) + 1) % COLORS.length];
  const initial = saved || { nickname: "", avatar: suggestedAvatar, color: suggestedColor };

  async function join(profile: Profile) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const ticket = await joinRoom(code, profile);
      saveSession(ticket.code, ticket.token, profile);
      sfx.correct();
      onJoined(ticket.token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "加入失败了，再试一次吧");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="join-page">
      <Scene variant="night" />
      <header className="join-nav">
        <button className="text-button" onClick={() => navigate("/")}>
          <Icon name="back" size={18} /> 回首页
        </button>
        <span className="brand-inline">
          <Icon name="heart" size={16} filled /> 二人世界
        </span>
      </header>

      <main className="join-main">
        {loading ? (
          <div className="join-card loading-card">
            <span className="spinner" />
            <p>正在推开小屋的门…</p>
          </div>
        ) : !info ? (
          <div className="join-card">
            <span className="join-emoji">🫧</span>
            <h1>这间小屋不见了</h1>
            <p className="muted">{error || "房间可能已经过期，或者链接不太对。"}</p>
            <div className="button-row">
              <button className="primary" onClick={() => navigate("/")}>
                回首页重新开一间
              </button>
            </div>
          </div>
        ) : info.full ? (
          <div className="join-card">
            <span className="join-emoji">🥲</span>
            <h1>小屋已经坐满两个人啦</h1>
            <p className="muted">
              房间 <b>{code}</b> 里已经有两个人在玩。如果你本来就属于这里，用之前那台设备或浏览器打开就能回到原位。
            </p>
            <div className="button-row">
              <button className="primary" onClick={() => navigate("/")}>
                回首页
              </button>
            </div>
          </div>
        ) : (
          <div className="join-card">
            <div className="join-host">
              {host?.avatar ? (
                <Critter avatar={host.avatar as any} color={host.color || "#FF6B6B"} size={88} mood="joy" className="bob" />
              ) : (
                <EmptySeat size={88} />
              )}
              <span className="join-code">房间 {code}</span>
              <h1>{host?.nickname || "TA"} 邀请你进入小屋</h1>
              <p className="muted">这里是只属于你们两个人的小地方。填个昵称，坐到 TA 旁边吧。</p>
            </div>
            <ProfileForm
              initial={initial}
              submitLabel="加入 TA 的小屋"
              busy={busy}
              onSubmit={join}
              onChange={setDraft}
              compact
            />
            {!draft?.nickname && <p className="small-print muted center">先在上面写一个昵称，就能进去啦。</p>}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <p className="join-footnote">
              <Icon name="lock" size={14} /> 没有注册，没有陌生人，房间过期后自动消失
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function LiveRoom({ code, token, onInvalid }: { code: string; token: string; onInvalid: () => void }) {
  const room = useRoom(code, token);
  const { state, seat, status, notice, send, act, now, subscribe, reactions, notify, welcomeSeq } = room;
  const [soundOn, setSoundOn] = useState(() => loadSound());
  const [shareOpen, setShareOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [exitConfirm, setExitConfirm] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [reactionOpen, setReactionOpen] = useState(false);
  const prevConnected = useRef<[boolean, boolean] | null>(null);
  const prevReactionCount = useRef(0);
  const codeCopy = useCallback(async () => {
    const base = await getShareBase();
    const ok = await copyText(buildRoomLink(base, code));
    notify(ok ? "邀请链接已复制，发给 TA 吧" : "复制失败了，点右上角的分享试试");
  }, [code, notify]);

  useEffect(() => {
    setSoundEnabled(soundOn);
    saveSound(soundOn);
  }, [soundOn]);

  useEffect(() => {
    document.title = state?.game
      ? `${GAME_MAP[state.game.id]?.name || "一起玩"} · 二人世界`
      : state
        ? `小屋 ${code} · 二人世界`
        : "二人世界 · 和 TA 一起玩的小游戏";
    return () => {
      document.title = "二人世界 · 和 TA 一起玩的小游戏";
    };
  }, [state?.game?.id, state?.gameId, code]);

  useEffect(() => {
    if (status === "invalid") onInvalid();
  }, [status, onInvalid]);

  useEffect(() => {
    if (!state) return;
    const conn: [boolean, boolean] = [state.seats[0].connected, state.seats[1].connected];
    if (prevConnected.current && seat !== null) {
      const other = 1 - seat;
      if (state.seats[other].profile && prevConnected.current[other] !== conn[other]) {
        notify(conn[other] ? "TA 上线啦" : "TA 暂时离开了，等一下就会回来");
        if (conn[other]) sfx.reaction();
      }
    }
    prevConnected.current = conn;
  }, [state, seat, notify]);

  useEffect(() => {
    if (reactions.length > prevReactionCount.current) sfx.reaction();
    prevReactionCount.current = reactions.length;
  }, [reactions.length]);

  useEffect(() => {
    if (!state?.game) setReactionOpen(false);
  }, [state?.game]);

  if (status === "replaced") {
    return (
      <div className="status-page">
        <Scene variant="night" />
        <div className="status-card">
          <span className="join-emoji">🪟</span>
          <h1>小屋在另一个页面打开了</h1>
          <p className="muted">同一个身份只能在同一个地方玩。关掉另一个标签页，或者点下面重新连接。</p>
          <button className="primary" onClick={() => location.reload()}>
            在这里继续
          </button>
          <button className="text-button" onClick={() => navigate("/")}>
            回首页
          </button>
        </div>
      </div>
    );
  }

  if (!state || seat === null) {
    return (
      <div className="status-page">
        <Scene variant="day" />
        <div className="status-card">
          <span className="spinner" />
          <h1>正在推开小屋的门…</h1>
          <p className="muted">
            {status === "offline" ? "网络好像有点慢，正在重试。" : "马上就好。"}
          </p>
          {status === "offline" && (
            <button className="text-button" onClick={() => navigate("/")}>
              回首页
            </button>
          )}
        </div>
      </div>
    );
  }

  const myProfile = state.seats[seat]?.profile;
  const otherSeat = 1 - seat;
  const otherProfile = state.seats[otherSeat]?.profile;
  const bothHere = !!(state.seats[0].profile && state.seats[1].profile);
  const meta = GAME_MAP[state.game?.id || state.gameId] || GAMES[0];
  const night = state.game?.id === "talk-cards" || state.game?.id === "mind-meld";
  const playing = !!state.game;

  return (
    <div className={"room-page " + (playing ? "is-playing" : "in-lobby")}>
      <Scene variant={night ? "night" : "day"} />

      <header className="room-topbar">
        <div className="topbar-left">
          <button className="icon-button back" onClick={() => navigate("/")} aria-label="回首页">
            <Icon name="back" size={21} />
          </button>
          <button className="room-code-button" onClick={codeCopy} title="复制邀请链接">
            <span>房间</span>
            <b>{code}</b>
            <Icon name="copy" size={15} />
          </button>
          <span className={"conn-pill " + status}>
            <i />
            {status === "online" ? "已连线" : status === "connecting" ? "连接中" : "重连中"}
          </span>
        </div>
        <div className="topbar-right">
          <button
            className="icon-button"
            onClick={() => {
              const next = !soundOn;
              setSoundOn(next);
              setSoundEnabled(next);
              if (next) sfx.tap();
            }}
            aria-label={soundOn ? "关闭音效" : "打开音效"}
            title={soundOn ? "关闭音效" : "打开音效"}
          >
            <Icon name={soundOn ? "sound" : "mute"} size={20} />
          </button>
          <button
            className="icon-button"
            onClick={() => {
              setShareOpen(true);
              sfx.tap();
            }}
            aria-label="分享小屋"
            title="分享小屋"
          >
            <Icon name="share" size={20} />
          </button>
          <button className="self-button" onClick={() => setProfileOpen(true)} aria-label="修改我的样子">
            <Critter avatar={myProfile?.avatar} color={myProfile?.color} size={38} shadow={false} />
          </button>
          {playing && (
            <button className="secondary small lobby-exit" onClick={() => setExitConfirm(true)}>
              <Icon name="home" size={16} /> 回大厅
            </button>
          )}
        </div>
      </header>

      {status === "offline" && <div className="offline-bar">网络断开了，正在自动重连… 进度还留着</div>}

      {playing && state.game ? (
        <main className="play-main">
          <div className="play-meta">
            <div className="play-title">
              <span className="play-emoji" style={{ background: `linear-gradient(135deg, ${meta.gradient[0]}, ${meta.gradient[1]})` }}>
                {meta.emoji}
              </span>
              <div>
                <b>{meta.name}</b>
                <span>{meta.tagline}</span>
              </div>
            </div>
            <div className="play-players">
              <span className={state.seats[0].connected ? "on" : ""}>{state.seats[0].profile?.nickname || "—"}</span>
              <Icon name="heart" size={14} filled />
              <span className={state.seats[1].connected ? "on" : ""}>{state.seats[1].profile?.nickname || "—"}</span>
            </div>
          </div>
          {otherProfile && !state.seats[otherSeat].connected && (
            <div className="partner-away">TA 暂时掉线了，等你回来继续</div>
          )}
          <GameStageHost
            key={`${state.game.run}:${welcomeSeq}`}
            room={state}
            seat={seat}
            game={state.game}
            act={act}
            send={send}
            now={now}
            subscribe={subscribe}
            onRestart={() => {
              sfx.tap();
              send({ type: "start" });
            }}
            onExit={() => send({ type: "exit" })}
          />
        </main>
      ) : (
        <Lobby
          state={state}
          seat={seat}
          code={code}
          bothHere={bothHere}
          send={send}
          onShare={() => setShareOpen(true)}
          onJournal={() => setJournalOpen(true)}
        />
      )}

      {playing && (
        <div className={"reaction-dock " + (reactionOpen ? "open" : "")}>
          {reactionOpen && (
            <div className="reaction-tray">
              {["🫶", "😘", "😂", "🥺", "❤️", "✨"].map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    send({ type: "reaction", emoji: e });
                    setReactionOpen(false);
                  }}
                  aria-label={"发送 " + e}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
          <button className="reaction-fab" onClick={() => setReactionOpen((v) => !v)} aria-label="给 TA 一个反应">
            <Icon name="heart" size={22} filled />
          </button>
        </div>
      )}

      <div className="reaction-layer" aria-live="polite">
        {reactions.map((r, i) => (
          <span key={r.id} className={"float-emoji seat-" + r.seat} style={{ animationDelay: `${i * 30}ms` }}>
            {r.emoji}
          </span>
        ))}
      </div>

      <Toast notice={notice} />

      {shareOpen && <ShareModal code={code} onClose={() => setShareOpen(false)} notify={notify} />}

      {profileOpen && myProfile && (
        <Modal title="换个小样子" onClose={() => setProfileOpen(false)}>
          <ProfileForm
            initial={myProfile}
            submitLabel="还是我，就这样"
            compact
            onSubmit={(p) => {
              saveProfile(p);
              send({ type: "profile", profile: p });
              setProfileOpen(false);
              notify("换好啦");
            }}
          />
        </Modal>
      )}

      {exitConfirm && (
        <Modal title="回大厅？" onClose={() => setExitConfirm(false)}>
          <p className="modal-text">这一局的进度会一起结束，结果和分数会留在你们的纪念册里。TA 也会回到大厅。</p>
          <div className="button-row">
            <button
              className="primary"
              onClick={() => {
                setExitConfirm(false);
                send({ type: "exit" });
              }}
            >
              回大厅
            </button>
            <button className="secondary" onClick={() => setExitConfirm(false)}>
              再玩一会儿
            </button>
          </div>
        </Modal>
      )}

      {journalOpen && (
        <Modal title="我们的纪念册" onClose={() => setJournalOpen(false)} wide>
          <JournalList state={state} />
        </Modal>
      )}
    </div>
  );
}

function Lobby({
  state,
  seat,
  code,
  bothHere,
  send,
  onShare,
  onJournal,
}: {
  state: RoomState;
  seat: number;
  code: string;
  bothHere: boolean;
  send: (msg: Record<string, unknown>) => boolean;
  onShare: () => void;
  onJournal: () => void;
}) {
  const meta = GAME_MAP[state.gameId] || GAMES[0];
  const current = state.settings[state.gameId] || {};
  const journal = state.journal.slice(-3).reverse();
  const myWins = state.stats?.wins?.gomoku?.[seat] ?? 0;

  return (
    <main className="room-main lobby-main">
      <section className="pair-banner">
        <Couple left={state.seats[0].profile} right={state.seats[1].profile} size={116} />
        <div className="pair-copy">
          <span className="eyebrow">只属于你们两个人的小屋</span>
          <h1>
            {state.seats[0].profile?.nickname || "你"}
            <span className="pair-heart">
              <Icon name="heart" size={20} filled />
            </span>
            {state.seats[1].profile?.nickname || "等 TA 进来"}
          </h1>
          <p>
            {bothHere ? (
              <>
                两个人都到齐啦，选一个想玩的游戏吧。
                {myWins > 0 && <> 你已经赢了 {myWins} 局五子棋。</>}
              </>
            ) : (
              <>把房间号 <b>{code}</b> 或邀请链接发给 TA，等 TA 坐到你旁边。</>
            )}
          </p>
          <div className="pair-actions">
            {!bothHere && (
              <button className="primary" onClick={onShare}>
                <Icon name="share" size={18} /> 把 TA 叫进来
              </button>
            )}
            <button className="secondary" onClick={onShare}>
              <Icon name="qr" size={18} /> 房间二维码
            </button>
            <button className="text-button" onClick={onJournal}>
              <Icon name="book" size={17} /> 纪念册{state.journal.length > 0 ? ` · ${state.journal.length}` : ""}
            </button>
          </div>
        </div>
        <div className="pair-status">
          {[0, 1].map((n) => {
            const s = state.seats[n];
            return (
              <div className={"seat-status " + (s.connected ? "on" : "")} key={n}>
                <Critter avatar={s.profile?.avatar} color={s.profile?.color} size={34} shadow={false} />
                <div>
                  <b>{s.profile?.nickname || "空位"}</b>
                  <span>{s.profile ? (s.connected ? "在线" : "暂时离开") : "等 TA"}</span>
                </div>
                <i />
              </div>
            );
          })}
        </div>
      </section>

      <section className="lobby-grid">
        <div className="lobby-games">
          <div className="lobby-section-head">
            <div>
              <span className="eyebrow">今天想玩点什么</span>
              <h2>挑一个小游戏</h2>
            </div>
            <span className="muted">{GAMES.length} 种玩法</span>
          </div>
          <div className="game-picker">
            {GAMES.map((g) => (
              <button
                key={g.id}
                className={"picker-card " + (state.gameId === g.id ? "selected" : "")}
                style={{ ["--g1" as string]: g.gradient[0], ["--g2" as string]: g.gradient[1] }}
                onClick={() => {
                  if (state.gameId === g.id) return;
                  sfx.tap();
                  send({ type: "select", gameId: g.id });
                }}
                aria-pressed={state.gameId === g.id}
              >
                <span className="picker-emoji">{g.emoji}</span>
                <span className="picker-text">
                  <b>{g.name}</b>
                  <small>{g.tagline}</small>
                </span>
                <span className="picker-check">{state.gameId === g.id ? "✓" : ""}</span>
              </button>
            ))}
          </div>

          {journal.length > 0 && (
            <div className="journal-strip">
              <div className="lobby-section-head mini">
                <h3>
                  <Icon name="book" size={18} /> 最近的回忆
                </h3>
                <button className="text-button" onClick={onJournal}>
                  全部 →
                </button>
              </div>
              <div className="journal-mini-list">
                {journal.map((j) => (
                  <div className="journal-mini" key={j.id}>
                    <span>{GAME_MAP[j.gameId]?.emoji || "💛"}</span>
                    <div>
                      <b>{j.title}</b>
                      <small>{j.detail}</small>
                    </div>
                    <time>{timeAgo(j.at)}</time>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="lobby-detail">
          <div
            className="detail-hero"
            style={{ background: `linear-gradient(135deg, ${meta.gradient[0]}, ${meta.gradient[1]})` }}
          >
            <span>{meta.emoji}</span>
            <div>
              <h2>{meta.name}</h2>
              <p>{meta.tagline}</p>
            </div>
          </div>
          <div className="detail-body">
            <p className="detail-intro">{meta.intro}</p>
            <ul className="rules">
              {meta.rules.map((r, i) => (
                <li key={i}>
                  <span>{i + 1}</span>
                  {r}
                </li>
              ))}
            </ul>
            <div className="detail-meta">
              <span>
                <Icon name="clock" size={14} /> {meta.duration}
              </span>
              <span>
                <Icon name="wifi" size={14} /> {meta.net}
              </span>
            </div>
            <GameSettings
              meta={meta}
              settings={current}
              onChange={(key, value) => send({ type: "settings", settings: { ...current, [key]: value } })}
            />
            <button
              className="primary big wide start-button"
              disabled={!bothHere}
              onClick={() => {
                sfx.win();
                send({ type: "start" });
              }}
            >
              <Icon name="play" size={18} /> {bothHere ? "开始游戏" : "等 TA 进来就可以开始"}
            </button>
            {!bothHere && (
              <button className="text-button wide center" onClick={onShare}>
                先复制邀请链接给 TA →
              </button>
            )}
          </div>
        </aside>
      </section>

      <footer className="room-foot">
        <span>
          <Icon name="heart" size={14} filled /> 房间 {code} · 这些画面只有你们两个人看得到
        </span>
      </footer>
    </main>
  );
}

function JournalList({ state }: { state: RoomState }) {
  const entries = [...state.journal].reverse();
  if (!entries.length) {
    return (
      <div className="journal-empty">
        <span>📖</span>
        <p>一起玩完第一局，这里就会留下你们的第一条回忆。</p>
      </div>
    );
  }
  return (
    <div className="journal-list">
      {entries.map((j) => (
        <article key={j.id} className="journal-entry">
          <span className="journal-icon">{GAME_MAP[j.gameId]?.emoji || "💛"}</span>
          <div>
            <header>
              <b>{j.title}</b>
              <time>{new Date(j.at).toLocaleString("zh-CN")}</time>
            </header>
            <p>{j.detail}</p>
          </div>
        </article>
      ))}
    </div>
  );
}