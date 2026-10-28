import { useMemo, useState } from "react";
import { GAMES, type Profile } from "../types";
import { Scene, Logo } from "../components/Scene";
import { Couple } from "../components/Critter";
import { ProfileForm } from "../components/ProfileForm";
import { Icon } from "../components/Icon";
import { createRoom, joinRoom, ApiError } from "../lib/api";
import { getLastRoom, loadProfile, saveSession } from "../lib/storage";
import { navigate } from "../lib/router";
import { sfx } from "../lib/sound";

export function HomePage() {
  const saved = useMemo(() => loadProfile(), []);
  const last = useMemo(() => getLastRoom(), []);
  const [draft, setDraft] = useState<Profile | null>(saved);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState("");

  async function create(profile: Profile) {
    if (busy) return;
    setBusy("create");
    setError("");
    sfx.tap();
    try {
      const ticket = await createRoom(profile);
      saveSession(ticket.code, ticket.token, profile);
      navigate(`/r/${ticket.code}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "创建失败了，再试一次吧");
    } finally {
      setBusy(null);
    }
  }

  async function join() {
    if (busy) return;
    const code = joinCode
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, "")
      .slice(0, 6);
    if (code.length < 4) {
      setError("房间号看起来不太对，再检查一下");
      return;
    }
    const profile = draft?.nickname ? draft : saved;
    if (!profile?.nickname) {
      setError("先在左边写一个昵称，让 TA 知道是你");
      return;
    }
    setBusy("join");
    setError("");
    sfx.tap();
    try {
      const ticket = await joinRoom(code, profile);
      saveSession(ticket.code, ticket.token, profile);
      navigate(`/r/${ticket.code}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "加入失败了，再试一次吧");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="home">
      <Scene />
      <header className="home-nav">
        <div className="home-brand">
          <span className="brand-heart">
            <Icon name="heart" size={18} filled />
          </span>
          <b>二人世界</b>
          <span className="brand-sub">只属于两个人的小屋</span>
        </div>
        <nav className="home-links">
          <a href="#games">玩法</a>
          <a href="#how">怎么玩</a>
          <a href="#enter" className="nav-cta">
            进入小屋
          </a>
        </nav>
      </header>

      <main className="home-main">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">👩‍❤️‍👨 为两个人做的网页小游戏</span>
            <Logo className="hero-logo" />
            <h1>和 TA 一起，在各自的手机上玩的小游戏。</h1>
            <p className="hero-sub">
              你画我猜、心有灵犀、你懂我吗、五子棋、跳棋、深夜聊天卡……创建一个小屋，把链接发给 TA，
              两个人同时上线就能玩。不用下载 App，也不用注册账号。
            </p>
            <div className="hero-chips">
              <span>💻 打开网页就能玩</span>
              <span>📱 两台手机一起</span>
              <span>🔒 只有你们两个人</span>
            </div>
            <div className="hero-actions">
              <a className="primary big" href="#enter">
                <Icon name="sparkle" size={19} /> 进入我们的小屋
              </a>
              <a className="secondary big" href="#games">
                先看看玩法
              </a>
            </div>
            {last && (
              <button className="last-room-link" onClick={() => navigate(`/r/${last.code}`)}>
                <Icon name="clock" size={16} /> 回到上次的小屋 <b>{last.code}</b> →
              </button>
            )}
          </div>

          <div className="hero-art" aria-hidden="true">
            <div className="hero-bubble left-bubble">今天想玩什么呀？</div>
            <Couple left={saved || { avatar: "bunny", color: "#FF6B6B" }} right={{ avatar: "bear", color: "#4D9DFF" }} size={132} />
            <div className="hero-bubble right-bubble">都想和你一起玩</div>
            <div className="floating-tag t1">🎨 一起画</div>
            <div className="floating-tag t2">🔮 心有灵犀</div>
            <div className="floating-tag t3">🌙 聊到深夜</div>
          </div>
        </section>

        <section className="enter-section" id="enter">
          <div className="enter-card">
            <div className="enter-side">
              <span className="eyebrow">第一步 · 给自己捏个小样子</span>
                {/* 小插画放在侧栏底部，桌面端不会留下空白 */}
              <h2>一会儿见，记得带上 TA。</h2>
              <p>
                昵称和小动物只保存在你自己的浏览器里。创建房间后，把六位房间号和链接发给 TA，
                等对方进来就可以开始。
              </p>
              <ul className="enter-points">
                <li>
                  <Icon name="users" size={18} /> 两个人各用一台设备，同时在线
                </li>
                <li>
                  <Icon name="wifi" size={18} /> 断线会自动重连，进度不会丢
                </li>
                <li>
                  <Icon name="book" size={18} /> 每一局都会记进你们的纪念册
                </li>
              </ul>
              {last && (
                <button className="secondary small" onClick={() => navigate(`/r/${last.code}`)}>
                  回到 {last.code} 的小屋
                </button>
              )}
              <div className="enter-art" aria-hidden="true">
                <div className="polaroid">
                  <Couple left={draft || saved} right={null} size={72} />
                  <span>等 TA 坐到你旁边</span>
                </div>
                <p className="enter-quote">“今天也要一起玩一会儿。”</p>
              </div>
            </div>

            <div className="enter-form">
              <ProfileForm
                initial={saved}
                submitLabel="创建我们的小屋"
                busy={busy === "create"}
                onSubmit={create}
                onChange={(p) => setDraft(p)}
              />

              <div className="or-divider">
                <span>或者，用房间号加入</span>
              </div>
              <form
                className="join-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void join();
                }}
              >
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
                  placeholder="六位房间号"
                  aria-label="房间号"
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={6}
                />
                <button className="secondary" disabled={busy === "join" || joinCode.length < 4}>
                  {busy === "join" ? "正在加入…" : "加入"}
                </button>
              </form>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <p className="small-print muted enter-footnote">
                提示：两个人连同一个 WiFi 时，用电脑上显示的局域网地址打开最稳；想在外网一起玩，把服务部署到一台能访问的服务器即可。
              </p>
            </div>
          </div>
        </section>

        <section className="showcase" id="games">
          <div className="section-head">
            <div>
              <span className="eyebrow">小屋里有什么</span>
              <h2>{GAMES.length} 种玩法，都是两个人的事。</h2>
            </div>
            <p>都是从两个人一起玩的角度设计的：没有陌生人、没有排行榜，只有你们。</p>
          </div>
          <div className="game-grid home-game-grid">
            {GAMES.map((g, i) => (
              <article
                className="game-tile"
                key={g.id}
                style={{ ["--g1" as string]: g.gradient[0], ["--g2" as string]: g.gradient[1], animationDelay: `${i * 60}ms` }}
              >
                <div className="game-tile-art">
                  <span className="game-emoji">{g.emoji}</span>
                  <span className="game-duration">
                    <Icon name="clock" size={13} /> {g.duration}
                  </span>
                </div>
                <div className="game-tile-body">
                  <h3>{g.name}</h3>
                  <p>{g.tagline}</p>
                  <div className="tag-row">
                    {g.tags.map((t) => (
                      <span key={t} className="tag">
                        {t}
                      </span>
                    ))}
                    <span className="tag net">{g.net}</span>
                  </div>
                </div>
              </article>
            ))}
            <article className="game-tile more-tile">
              <div className="more-inner">
                <span>✨</span>
                <h3>更多玩法在路上</h3>
                <p>拼图、红绳、节奏小游戏……小屋留好了扩展的位置，想加什么都可以。</p>
              </div>
            </article>
          </div>
        </section>

        <section className="how" id="how">
          <div className="section-head">
            <div>
              <span className="eyebrow">三步就能一起玩</span>
              <h2>创建、分享、见面。</h2>
            </div>
          </div>
          <div className="how-grid">
            <article>
              <span className="how-num">01</span>
              <h3>捏好小样子，创建小屋</h3>
              <p>选昵称、小动物和围巾颜色。房间是临时的，不需要注册。</p>
            </article>
            <article>
              <span className="how-num">02</span>
              <h3>把链接发给 TA</h3>
              <p>复制邀请链接或扫二维码。TA 打开后填个昵称，就坐到你旁边了。</p>
            </article>
            <article>
              <span className="how-num">03</span>
              <h3>各自拿一台设备，开始</h3>
              <p>画面和操作实时同步。断线也没关系，回来还能接着玩。</p>
            </article>
          </div>
          <div className="how-cta">
            <Couple left={saved || { avatar: "bunny", color: "#FF6B6B" }} right={null} size={86} />
            <div>
              <strong>现在就开一间只属于你们的小屋吧</strong>
              <button className="primary" onClick={() => document.getElementById("enter")?.scrollIntoView({ behavior: "smooth" })}>
                开始创建 <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <span>
          <Icon name="heart" size={15} filled /> 二人世界 · 为两个人做的小游戏
        </span>
        <span>房间闲置 12 小时后会自动清理 · 数据只保存在你自己的服务器上</span>
      </footer>
    </div>
  );
}