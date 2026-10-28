import { useEffect, useMemo, useState } from "react";
import { GAMES, type Profile } from "../types";
import { Scene, Logo } from "../components/Scene";
import { Couple } from "../components/Critter";
import { ProfileForm } from "../components/ProfileForm";
import { Modal } from "../components/Modal";
import { Icon } from "../components/Icon";
import { createRoom, ApiError } from "../lib/api";
import { getLastRoom, knownRoomsWithToken, loadProfile, saveSession } from "../lib/storage";
import { navigate } from "../lib/router";
import { sfx } from "../lib/sound";
import { JournalView } from "../components/JournalView";
import { MyData } from "../components/MyData";

type HomeModal = "create" | "join" | "games" | "how" | "memory" | "data" | null;

export function HomePage() {
  const saved = useMemo(() => loadProfile(), []);
  const last = useMemo(() => getLastRoom(), []);
  const [known, setKnown] = useState(() => knownRoomsWithToken());
  const [modal, setModal] = useState<HomeModal>(null);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // PWA 快捷方式（manifest shortcuts）：/?action=create 直接开创建弹窗
  useEffect(() => {
    const action = new URLSearchParams(location.search).get("action");
    if (action === "create" || action === "join") {
      setModal(action);
      history.replaceState(null, "", location.pathname);
    }
  }, []);

  async function create(profile: Profile) {
    if (busy) return;
    setBusy(true);
    setError("");
    sfx.tap();
    try {
      const ticket = await createRoom(profile);
      saveSession(ticket.code, ticket.token, profile);
      navigate(`/r/${ticket.code}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "创建失败了，再试一次吧");
    } finally {
      setBusy(false);
    }
  }

  function goJoin() {
    const code = joinCode
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, "")
      .slice(0, 6);
    if (code.length < 4) {
      setError("房间号看起来不太对，再检查一下");
      return;
    }
    setModal(null);
    navigate(`/r/${code}`);
  }

  return (
    <div className="home-screen">
      <Scene />

      <header className="home-nav home-nav-compact">
        <div className="home-brand">
          <span className="brand-heart">
            <Icon name="heart" size={18} filled />
          </span>
          <b>二人世界</b>
          <span className="brand-sub">只属于两个人的小屋</span>
        </div>
        <div className="home-links">
          <button className="text-button" onClick={() => setModal("games")}>
            玩法一览
          </button>
          <button className="text-button" onClick={() => setModal("how")}>
            怎么玩
          </button>
          <button className="nav-cta" onClick={() => setModal("create")}>
            进入小屋
          </button>
        </div>
      </header>

      <main className="home-stage">
        <section className="title-hero">
          <div className="title-copy">
            <span className="eyebrow">👩‍❤️‍👨 为两个人做的网页小游戏</span>
            <Logo className="title-logo" />
            <h1>和 TA 一起，在各自的手机上玩的小游戏。</h1>
            <p className="title-sub">
              你画我猜、心有灵犀、你懂我吗、五子棋、跳棋、深夜聊天卡。
              创建一个小屋，把链接发给 TA，不用下载 App，也不用注册账号。
            </p>

            <div className="title-actions">
              <button className="primary big" onClick={() => setModal("create")}>
                <Icon name="sparkle" size={19} /> 创建我们的小屋
              </button>
              <button className="secondary big" onClick={() => setModal("join")}>
                <Icon name="users" size={19} /> 加入 TA 的小屋
              </button>
            </div>

            {(last || known.length > 0) && (
              <div className="title-links">
                {last && (
                  <button className="last-room-link" onClick={() => navigate(`/r/${last.code}`)}>
                    <Icon name="clock" size={16} /> 回到上次的小屋 <b>{last.code}</b> →
                  </button>
                )}

                {known.length > 0 && (
                  <button className="last-room-link memory-link" onClick={() => setModal("memory")}>
                    <Icon name="book" size={16} /> 我们的回忆 <b>{known.length}</b> 间小屋 →
                  </button>
                )}

                {known.length > 0 && (
                  <button className="last-room-link memory-link" onClick={() => setModal("data")}>
                    <Icon name="lock" size={16} /> 我的数据
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="title-art" aria-hidden="true">
            <div className="hero-bubble left-bubble">今天想玩什么呀？</div>
            <Couple
              left={saved || { avatar: "bunny", color: "#FF6B6B" }}
              right={{ avatar: "bear", color: "#4D9DFF" }}
              size={140}
            />
            <div className="hero-bubble right-bubble">都想和你一起玩</div>
            <div className="floating-tag t1">🎨 一起画</div>
            <div className="floating-tag t3">🌙 聊到深夜</div>
          </div>
        </section>

        <section className="home-game-strip">
          <div className="strip-head">
            <span>
              <b>{GAMES.length}</b> 种玩法，都是两个人的事
            </span>
            <button className="text-button" onClick={() => setModal("games")}>
              全部玩法 →
            </button>
          </div>
          <div className="strip-games">
            {GAMES.map((g) => (
              <button
                key={g.id}
                className="mini-game"
                onClick={() => setModal("games")}
                style={{ ["--g1" as string]: g.gradient[0], ["--g2" as string]: g.gradient[1] }}
              >
                <span className="mini-game-emoji">{g.emoji}</span>
                <span className="mini-game-name">{g.name}</span>
              </button>
            ))}
          </div>
        </section>
      </main>

      <footer className="home-foot-mini">
        <span>
          <Icon name="heart" size={13} filled /> 二人世界 · 为两个人做的小游戏
        </span>
        <span className="home-foot-note">房间闲置 12 小时清理 · 数据只存在你的服务器</span>
        <nav className="home-legal-links">
          <a href="/terms">用户协议</a>
          <span aria-hidden="true">·</span>
          <a href="/privacy">隐私政策</a>
          <span aria-hidden="true">·</span>
          <button className="text-button" onClick={() => setModal("data")}>
            我的数据
          </button>
        </nav>
      </footer>

      {modal === "create" && (
        <Modal title="创建我们的小屋" onClose={() => setModal(null)}>
          <ProfileForm
            initial={saved}
            submitLabel="创建我们的小屋"
            busy={busy}
            onSubmit={create}
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <p className="small-print muted modal-footnote">
            创建后把邀请链接或二维码发给 TA，两个人各用一台设备就能玩。
          </p>
        </Modal>
      )}

      {modal === "join" && (
        <Modal title="加入 TA 的小屋" onClose={() => setModal(null)}>
          <p className="modal-text">输入 TA 发来的六位房间号，下一步填个昵称就能进去。</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              goJoin();
            }}
          >
            <label className="field">
              <span>房间号</span>
              <input
                value={joinCode}
                onChange={(e) => {
                  setJoinCode(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 6));
                  setError("");
                }}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  const match = text.match(/\/r\/([a-zA-Z0-9]{4,10})/);
                  if (match) {
                    e.preventDefault();
                    setJoinCode(match[1].toUpperCase());
                    setError("");
                  }
                }}
                placeholder="例如 A7K2M9"
                className="join-code-input"
                autoFocus
                maxLength={6}
                aria-label="房间号"
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary wide" disabled={joinCode.length < 4} style={{ marginTop: 14 }}>
              下一步
            </button>
          </form>
          <p className="small-print muted modal-footnote">
            也可以直接打开 TA 发来的邀请链接，会自动跳到同一个房间。
          </p>
        </Modal>
      )}

      {modal === "games" && (
        <Modal title="小屋里的玩法" onClose={() => setModal(null)} wide>
          <div className="modal-game-grid">
            {GAMES.map((g) => (
              <article
                key={g.id}
                className="modal-game"
                style={{ ["--g1" as string]: g.gradient[0], ["--g2" as string]: g.gradient[1] }}
              >
                <span className="modal-game-emoji">{g.emoji}</span>
                <div>
                  <h3>{g.name}</h3>
                  <p>{g.tagline}</p>
                  <small>
                    {g.duration} · {g.net}
                  </small>
                </div>
              </article>
            ))}
          </div>
          <button
            className="primary wide"
            onClick={() => {
              setModal("create");
              setError("");
            }}
          >
            创建小屋，开始玩
          </button>
        </Modal>
      )}

      {modal === "how" && (
        <Modal title="怎么玩" onClose={() => setModal(null)}>
          <div className="how-list">
            <article>
              <span>01</span>
              <div>
                <h3>捏好小样子，创建小屋</h3>
                <p>选昵称、小动物和围巾颜色。房间是临时的，不需要注册。</p>
              </div>
            </article>
            <article>
              <span>02</span>
              <div>
                <h3>把链接发给 TA</h3>
                <p>复制邀请链接或扫二维码，TA 打开就能坐到你旁边。</p>
              </div>
            </article>
            <article>
              <span>03</span>
              <div>
                <h3>各拿一台设备，开始</h3>
                <p>画面和操作实时同步，断线回来还能接着玩。</p>
              </div>
            </article>
          </div>
          <button className="primary wide" onClick={() => setModal("create")}>
            创建小屋
          </button>
        </Modal>
      )}

      {modal === "memory" && (
        <Modal title="我们的回忆" onClose={() => setModal(null)} wide>
          <p className="small-print muted center" style={{ marginBottom: 12 }}>
            这些记录存在你们自己的服务器上，就算小屋过期了也还在。
          </p>
          <JournalView codes={known.map((k) => k.code)} />
        </Modal>
      )}

      {modal === "data" && (
        <Modal title="我的数据" onClose={() => setModal(null)} wide>
          <MyData
            onChanged={() => {
              setKnown(knownRoomsWithToken());
            }}
          />
        </Modal>
      )}
    </div>
  );
}