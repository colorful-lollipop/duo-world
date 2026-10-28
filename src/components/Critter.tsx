import type { AvatarId, Profile } from "../types";

const INK = "#3A2618";

const FUR: Record<AvatarId, { main: string; dark: string; light: string; inner: string }> = {
  bunny: { main: "#FFF8F2", dark: "#F0DFD2", light: "#FFE9EE", inner: "#FFB3C4" },
  bear: { main: "#C98B56", dark: "#A9713F", light: "#F6DEC0", inner: "#F2C9A0" },
  cat: { main: "#FFB55E", dark: "#E39A3F", light: "#FFF4E6", inner: "#FFC9D4" },
  dog: { main: "#F7E2C3", dark: "#D9B98D", light: "#FFFFFF", inner: "#A86F45" },
  fox: { main: "#F7883A", dark: "#D96A24", light: "#FFF4E8", inner: "#FFE9D6" },
  penguin: { main: "#34425E", dark: "#25324A", light: "#FFFFFF", inner: "#FFFFFF" },
};

export const AVATAR_NAMES: Record<AvatarId, string> = {
  bunny: "小兔",
  bear: "小熊",
  cat: "小猫",
  dog: "小狗",
  fox: "小狐",
  penguin: "企鹅",
};

export type Mood = "normal" | "joy" | "wow" | "sad" | "sleep";

interface CritterProps {
  avatar?: AvatarId | string;
  color?: string;
  mood?: Mood;
  pose?: "stand" | "up";
  size?: number;
  className?: string;
  label?: string;
  shadow?: boolean;
}

function Ears({ avatar, fur }: { avatar: AvatarId; fur: (typeof FUR)[AvatarId] }) {
  const common = { stroke: INK, strokeWidth: 3, strokeLinejoin: "round" as const };
  switch (avatar) {
    case "bunny":
      return (
        <g>
          <ellipse cx="46" cy="18" rx="8.5" ry="18" transform="rotate(-9 46 18)" fill={fur.main} stroke={INK} strokeWidth={3} />
          <ellipse cx="74" cy="18" rx="8.5" ry="18" transform="rotate(9 74 18)" fill={fur.main} stroke={INK} strokeWidth={3} />
          <ellipse cx="46.5" cy="19" rx="4" ry="11.5" transform="rotate(-9 46.5 19)" fill={fur.inner} />
          <ellipse cx="73.5" cy="19" rx="4" ry="11.5" transform="rotate(9 73.5 19)" fill={fur.inner} />
        </g>
      );
    case "bear":
      return (
        <g>
          <circle cx="38.5" cy="29" r="12" fill={fur.main} stroke={INK} strokeWidth={3} />
          <circle cx="81.5" cy="29" r="12" fill={fur.main} stroke={INK} strokeWidth={3} />
          <circle cx="38.5" cy="29" r="5.6" fill={fur.inner} />
          <circle cx="81.5" cy="29" r="5.6" fill={fur.inner} />
        </g>
      );
    case "cat":
      return (
        <g {...common}>
          <path d="M34,47 L37,11 L55,25 Z" fill={fur.main} />
          <path d="M86,47 L83,11 L65,25 Z" fill={fur.main} />
          <path d="M39,38 L40.5,20 L49,27 Z" fill={fur.inner} />
          <path d="M81,38 L79.5,20 L71,27 Z" fill={fur.inner} />
        </g>
      );
    case "dog":
      return (
        <g>
          <ellipse cx="33.5" cy="48" rx="9.5" ry="17" transform="rotate(16 33.5 48)" fill={fur.dark} stroke={INK} strokeWidth={3} />
          <ellipse cx="86.5" cy="48" rx="9.5" ry="17" transform="rotate(-16 86.5 48)" fill={fur.dark} stroke={INK} strokeWidth={3} />
          <ellipse cx="34.5" cy="49" rx="4" ry="9" transform="rotate(16 34.5 49)" fill={fur.inner} opacity={0.5} />
          <ellipse cx="85.5" cy="49" rx="4" ry="9" transform="rotate(-16 85.5 49)" fill={fur.inner} opacity={0.5} />
        </g>
      );
    case "fox":
      return (
        <g>
          <path d="M33,47 L29,7 L54,25 Z" fill={fur.main} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
          <path d="M87,47 L91,7 L66,25 Z" fill={fur.main} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
          <path d="M37,39 L35,17 L48,28 Z" fill={fur.inner} />
          <path d="M83,39 L85,17 L72,28 Z" fill={fur.inner} />
          <path d="M29,7 L35,17 L31,21 Z" fill={INK} opacity={0.85} />
          <path d="M91,7 L85,17 L89,21 Z" fill={INK} opacity={0.85} />
        </g>
      );
    case "penguin":
    default:
      return null;
  }
}

function Face({ avatar, mood, fur }: { avatar: AvatarId; mood: Mood; fur: (typeof FUR)[AvatarId] }) {
  const eye = (cx: number) => {
    if (mood === "joy") {
      return (
        <path
          d={`M${cx - 5},50 Q${cx},43 ${cx + 5},50`}
          fill="none"
          stroke={INK}
          strokeWidth="3.2"
          strokeLinecap="round"
        />
      );
    }
    if (mood === "sleep") {
      return <path d={`M${cx - 5},50 L${cx + 5},50`} stroke={INK} strokeWidth="3" strokeLinecap="round" />;
    }
    const r = mood === "wow" ? 5.2 : 4.2;
    return (
      <g>
        <circle cx={cx} cy={49} r={r} fill={INK} />
        <circle cx={cx - 1.4} cy={47.6} r={r * 0.34} fill="#FFFFFF" />
      </g>
    );
  };

  return (
    <g>
      {avatar === "penguin" ? (
        <ellipse cx="60" cy="56" rx="21.5" ry="19.5" fill="#FFFFFF" />
      ) : (
        <>
          {(avatar === "bear" || avatar === "dog") && <ellipse cx="60" cy="64" rx="16.5" ry="10.5" fill={fur.light} />}
          {avatar === "cat" && <ellipse cx="60" cy="64.5" rx="13.5" ry="8.5" fill={fur.light} />}
          {avatar === "fox" && <ellipse cx="60" cy="64" rx="16.5" ry="10.5" fill={fur.light} />}
          {avatar === "bunny" && <ellipse cx="60" cy="64" rx="14" ry="9" fill={fur.light} opacity={0.75} />}
        </>
      )}

      {eye(48.5)}
      {eye(71.5)}

      {(avatar === "bear" || avatar === "dog" || avatar === "fox" || avatar === "penguin") && (
        <path d="M56.8,60.5 L63.2,60.5 L60,64.6 Z" fill={avatar === "penguin" ? "#FFAA33" : INK} stroke={INK} strokeWidth="1.1" strokeLinejoin="round" />
      )}
      {(avatar === "bunny" || avatar === "cat") && (
        <path d="M57.4,60.8 L62.6,60.8 L60,64.2 Z" fill="#FF7F98" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
      )}

      {avatar === "cat" && (
        <g stroke={INK} strokeWidth="1.7" strokeLinecap="round" opacity="0.8">
          <path d="M34,62 L45,64" />
          <path d="M34.5,68 L45,68.5" />
          <path d="M86,62 L75,64" />
          <path d="M85.5,68 L75,68.5" />
        </g>
      )}

      {mood === "joy" && (
        <>
          <path d="M51.5,64.5 Q60,76 68.5,64.5 Z" fill="#C9364F" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
          <ellipse cx="60" cy="72" rx="4" ry="2.5" fill="#FF8FA3" />
        </>
      )}
      {mood === "wow" && (
        <ellipse cx="60" cy="68.5" rx="4.4" ry="5.4" fill="#C9364F" stroke={INK} strokeWidth="2" />
      )}
      {mood === "sad" && (
        <>
          <path d="M53,69.5 Q60,63.5 67,69.5" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M44.5,34 L54,37.5 M75.5,34 L66,37.5" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M77,52 C75,57 80,57.5 79,52.5 Z" fill="#7CCBFF" />
        </>
      )}
      {mood === "normal" && (
        <path d="M54,65.5 Q60,70.5 66,65.5" fill="none" stroke={INK} strokeWidth="2.3" strokeLinecap="round" />
      )}
      {mood === "sleep" && (
        <ellipse cx="60" cy="68" rx="3.6" ry="2.7" fill={INK} opacity={0.75} />
      )}

      <ellipse cx="39" cy="60" rx="6.6" ry="3.8" fill="#FF8FA3" opacity={0.55} />
      <ellipse cx="81" cy="60" rx="6.6" ry="3.8" fill="#FF8FA3" opacity={0.55} />
    </g>
  );
}

export function Critter({
  avatar = "bunny",
  color = "#FF6B6B",
  mood = "normal",
  pose = "stand",
  size = 72,
  className = "",
  label,
  shadow = true,
}: CritterProps) {
  const key = (["bunny", "bear", "cat", "dog", "fox", "penguin"].includes(avatar) ? avatar : "bunny") as AvatarId;
  const fur = FUR[key];
  const up = pose === "up";

  const arm = (left: boolean) => {
    const d = left
      ? up
        ? "M42,85 Q27,75 23,63"
        : "M42,85 Q31,92 29,98"
      : up
        ? "M78,85 Q93,75 97,63"
        : "M78,85 Q89,92 91,98";
    const paw = left ? (up ? [22, 62] : [28.5, 99]) : up ? [98, 62] : [91.5, 99];
    return (
      <g>
        <path d={d} fill="none" stroke={INK} strokeWidth="12.5" strokeLinecap="round" />
        <path d={d} fill="none" stroke={key === "penguin" ? fur.dark : fur.main} strokeWidth="8.5" strokeLinecap="round" />
        <circle cx={paw[0]} cy={paw[1]} r="5.6" fill={key === "penguin" ? fur.dark : fur.main} stroke={INK} strokeWidth="2.6" />
      </g>
    );
  };

  return (
    <svg
      className={`critter ${className}`}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {shadow && <ellipse cx="60" cy="113" rx="27" ry="4.5" fill="#3A2618" opacity="0.13" />}
      <Ears avatar={key} fur={fur} />
      <path d="M41,108 C34,90 38,73 60,73 C82,73 86,90 79,108 Z" fill={fur.main} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <ellipse cx="60" cy="95" rx="13.5" ry="12" fill={key === "penguin" ? "#FFFFFF" : fur.light} opacity={key === "bunny" ? 0.8 : 1} />
      <ellipse cx="47.5" cy="110.5" rx="8.5" ry="5.2" fill={key === "penguin" ? "#FFAA33" : fur.main} stroke={INK} strokeWidth="2.6" />
      <ellipse cx="72.5" cy="110.5" rx="8.5" ry="5.2" fill={key === "penguin" ? "#FFAA33" : fur.main} stroke={INK} strokeWidth="2.6" />
      {arm(true)}
      {arm(false)}
      <circle cx="60" cy="51" r="30" fill={fur.main} stroke={INK} strokeWidth="3" />
      <Face avatar={key} mood={mood} fur={fur} />
      <path
        d="M36,73 Q60,83 84,73 L84,78.5 Q60,88.5 36,78.5 Z"
        fill={color}
        stroke={INK}
        strokeWidth="2.8"
        strokeLinejoin="round"
      />
      <path
        d="M80,78 L89,92 L78,95 L72,82 Z"
        fill={color}
        stroke={INK}
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <circle cx="60" cy="82.5" r="3.4" fill="#FFD23F" stroke={INK} strokeWidth="1.8" />
    </svg>
  );
}

export function EmptySeat({ size = 96 }: { size?: number }) {
  return (
    <svg className="critter empty-seat" width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <ellipse cx="60" cy="113" rx="27" ry="4.5" fill="#3A2618" opacity="0.08" />
      <path
        d="M38,110 C32,92 37,74 60,74 C83,74 88,92 82,110 Z"
        fill="#FFF8E6"
        fillOpacity="0.65"
        stroke={INK}
        strokeWidth="2.6"
        strokeDasharray="6 5"
        strokeLinejoin="round"
      />
      <circle cx="60" cy="50" r="29" fill="#FFF8E6" fillOpacity="0.65" stroke={INK} strokeWidth="2.6" strokeDasharray="6 5" />
      <text x="60" y="61" textAnchor="middle" fill={INK} fontSize="34" fontFamily="inherit" opacity="0.5">
        ?
      </text>
    </svg>
  );
}

export function Couple({
  left,
  right,
  size = 128,
  className = "",
}: {
  left?: Pick<Profile, "avatar" | "color"> | null;
  right?: Pick<Profile, "avatar" | "color"> | null;
  size?: number;
  className?: string;
}) {
  return (
    <div className={`couple ${className}`} style={{ width: size * 2.05, height: size * 1.12 }}>
      <svg className="couple-thread" viewBox="0 0 260 120" aria-hidden="true">
        <path d="M46,102 Q130,126 214,102" fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" />
        <path d="M46,102 Q130,126 214,102" fill="none" stroke="#E8364F" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M124,113 l4.5,-5 a3.2,3.2 0 0 1 4.8,4.2 l-4.8,4.6 -4.8,-4.6 a3.2,3.2 0 0 1 4.8,-4.2 z" fill="#E8364F" stroke={INK} strokeWidth="1.4" />
      </svg>
      <div className="couple-seat left">
        {left ? <Critter avatar={left.avatar} color={left.color} size={size} mood="joy" /> : <EmptySeat size={size} />}
      </div>
      <div className="couple-seat right">
        {right ? <Critter avatar={right.avatar} color={right.color} size={size} mood="joy" /> : <EmptySeat size={size} />}
      </div>
    </div>
  );
}
