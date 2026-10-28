import { useEffect, useState } from "react";
import type { AvatarId, Mood, Profile } from "../types";
import { AVATARS, COLORS, MOODS } from "../lib/storage";
import { Critter, AVATAR_NAMES, MOOD_NAMES } from "./Critter";

export function ProfileForm({
  initial,
  submitLabel,
  busy = false,
  onSubmit,
  compact = false,
  onChange,
}: {
  initial?: Profile | null;
  submitLabel: string;
  busy?: boolean;
  onSubmit: (profile: Profile) => void;
  compact?: boolean;
  onChange?: (profile: Profile) => void;
}) {
  const [nickname, setNickname] = useState(initial?.nickname || "");
  const [avatar, setAvatar] = useState<AvatarId>(initial?.avatar || "bunny");
  const [color, setColor] = useState(initial?.color || COLORS[0]);
  const [mood, setMood] = useState<Mood>(initial?.mood || "joy");
  const [error, setError] = useState("");

  const profile: Profile = { nickname: nickname.trim() || "你", avatar, color, mood };

  useEffect(() => {
    onChange?.({ nickname: nickname.trim(), avatar, color, mood });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nickname, avatar, color, mood]);

  return (
    <form
      className={"profile-form " + (compact ? "compact" : "")}
      onSubmit={(e) => {
        e.preventDefault();
        const name = nickname.trim();
        if (!name) {
          setError("先写一个昵称吧，让 TA 知道是你");
          return;
        }
        setError("");
        onSubmit({ nickname: name.slice(0, 12), avatar, color, mood });
      }}
    >
      <div className="profile-preview">
        <Critter avatar={avatar} color={color} size={compact ? 76 : 96} mood={mood} className="bob" />
        <div className="profile-preview-text">
          <strong>{profile.nickname}</strong>
          <span>这是你在小屋里的样子</span>
        </div>
      </div>

      <label className="field">
        <span>怎么称呼你？</span>
        <input
          value={nickname}
          onChange={(e) => {
            setNickname(e.target.value);
            setError("");
          }}
          maxLength={12}
          placeholder="输入昵称"
          autoComplete="nickname"
          aria-label="昵称"
        />
      </label>

      <div className="field">
        <span>选一个小动物</span>
        <div className="avatar-grid">
          {AVATARS.map((a) => (
            <button
              type="button"
              key={a}
              className={"avatar-option " + (avatar === a ? "selected" : "")}
              onClick={() => setAvatar(a)}
              aria-pressed={avatar === a}
              aria-label={AVATAR_NAMES[a]}
            >
              <Critter avatar={a} color={color} size={52} mood={mood} shadow={false} />
              <small>{AVATAR_NAMES[a]}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>今天什么心情？</span>
        <div className="mood-row">
          {MOODS.map((m) => (
            <button
              type="button"
              key={m}
              className={"mood-option " + (mood === m ? "selected" : "")}
              onClick={() => setMood(m)}
              aria-pressed={mood === m}
              aria-label={MOOD_NAMES[m]}
            >
              <Critter avatar={avatar} color={color} size={44} mood={m} shadow={false} />
              <small>{MOOD_NAMES[m]}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>围巾的颜色</span>
        <div className="color-row">
          {COLORS.map((c) => (
            <button
              type="button"
              key={c}
              className={"color-dot " + (color === c ? "selected" : "")}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-pressed={color === c}
              aria-label={"颜色 " + c}
            >
              {color === c && <span className="color-check">✓</span>}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary wide" disabled={busy || !nickname.trim()}>
        {busy ? "正在进入小屋…" : submitLabel}
      </button>
    </form>
  );
}
