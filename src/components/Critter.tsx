import type { AvatarId, Mood, Profile } from "../types";

export type { Mood };

const INK = "#3A2618";
const PATCH = "#5C4030";

const FUR: Record<AvatarId, { main: string; dark: string; light: string; inner: string }> = {
  bunny: { main: "#FFF8F2", dark: "#F0DFD2", light: "#FFE9EE", inner: "#FFB3C4" },
  bear: { main: "#C98B56", dark: "#A9713F", light: "#F6DEC0", inner: "#F2C9A0" },
  cat: { main: "#FFB55E", dark: "#E39A3F", light: "#FFF4E6", inner: "#FFC9D4" },
  dog: { main: "#F7E2C3", dark: "#D9B98D", light: "#FFFFFF", inner: "#A86F45" },
  fox: { main: "#F7883A", dark: "#D96A24", light: "#FFF4E8", inner: "#FFE9D6" },
  penguin: { main: "#34425E", dark: "#25324A", light: "#FFFFFF", inner: "#FFFFFF" },
  pig: { main: "#FFAFBE", dark: "#F58B9E", light: "#FFE2E8", inner: "#FF8FA6" },
  mouse: { main: "#C6C9D6", dark: "#A7AABB", light: "#F1F2F7", inner: "#F5B6C6" },
  elephant: { main: "#A7BBD8", dark: "#89A1C4", light: "#E7EEF8", inner: "#F2B6C4" },
  hippo: { main: "#B4A6CE", dark: "#9686B4", light: "#E9E2F3", inner: "#C9AEE0" },
  boar: { main: "#B07A46", dark: "#8E5F34", light: "#EAD2B2", inner: "#D0A374" },
  donkey: { main: "#C8B79E", dark: "#A9957A", light: "#F0E8DA", inner: "#E0CDB2" },
  cow: { main: "#F7F2E9", dark: "#DED6C6", light: "#FFFFFF", inner: "#F4B7BE" },
};

export const AVATAR_NAMES: Record<AvatarId, string> = {
  bunny: "小兔",
  bear: "小熊",
  cat: "小猫",
  dog: "小狗",
  fox: "小狐",
  penguin: "企鹅",
  pig: "小猪",
  mouse: "小老鼠",
  elephant: "小象",
  hippo: "大河马",
  boar: "大野猪",
  donkey: "驴",
  cow: "牛",
};

export const MOOD_NAMES: Record<Mood, string> = {
  normal: "平静",
  joy: "开心",
  wow: "惊喜",
  sad: "难过",
  sleep: "犯困",
};

export const MOODS: Mood[] = ["normal", "joy", "wow", "sad", "sleep"];

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
    case "pig":
      return (
        <g {...common}>
          <path d="M35,45 Q33,22 47,25 Q52,36 44,46 Z" fill={fur.main} />
          <path d="M85,45 Q87,22 73,25 Q68,36 76,46 Z" fill={fur.main} />
          <path d="M40,38 Q40,30 45,32 Q46,38 42,41 Z" fill={fur.inner} />
          <path d="M80,38 Q80,30 75,32 Q74,38 78,41 Z" fill={fur.inner} />
        </g>
      );
    case "mouse":
      return (
        <g>
          <circle cx="33" cy="30" r="13.5" fill={fur.main} stroke={INK} strokeWidth={3} />
          <circle cx="87" cy="30" r="13.5" fill={fur.main} stroke={INK} strokeWidth={3} />
          <circle cx="33" cy="31" r="7" fill={fur.inner} />
          <circle cx="87" cy="31" r="7" fill={fur.inner} />
        </g>
      );
    case "elephant":
      return (
        <g>
          <ellipse cx="28" cy="50" rx="15" ry="20" fill={fur.main} stroke={INK} strokeWidth={3} />
          <ellipse cx="92" cy="50" rx="15" ry="20" fill={fur.main} stroke={INK} strokeWidth={3} />
          <ellipse cx="29" cy="52" rx="8" ry="12" fill={fur.inner} opacity={0.6} />
          <ellipse cx="91" cy="52" rx="8" ry="12" fill={fur.inner} opacity={0.6} />
        </g>
      );
    case "hippo":
      return (
        <g>
          <circle cx="42" cy="26" r="8.5" fill={fur.main} stroke={INK} strokeWidth={3} />
          <circle cx="78" cy="26" r="8.5" fill={fur.main} stroke={INK} strokeWidth={3} />
          <circle cx="42" cy="26" r="3.6" fill={fur.inner} />
          <circle cx="78" cy="26" r="3.6" fill={fur.inner} />
        </g>
      );
    case "boar":
      return (
        <g>
          <path d="M42,28 L46,10 L52,24 L58,7 L64,24 L70,10 L76,28 Z" fill={fur.dark} stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
          <path d="M36,42 L34,23 L48,31 Z" fill={fur.main} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
          <path d="M84,42 L86,23 L72,31 Z" fill={fur.main} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
          <path d="M40,36 L39,28 L46,32 Z" fill={fur.inner} />
          <path d="M80,36 L81,28 L74,32 Z" fill={fur.inner} />
        </g>
      );
    case "donkey":
      return (
        <g>
          <ellipse cx="44" cy="15" rx="7" ry="20.5" transform="rotate(-15 44 15)" fill={fur.main} stroke={INK} strokeWidth={3} />
          <ellipse cx="76" cy="15" rx="7" ry="20.5" transform="rotate(15 76 15)" fill={fur.main} stroke={INK} strokeWidth={3} />
          <ellipse cx="44.5" cy="16" rx="3.4" ry="12" transform="rotate(-15 44.5 16)" fill={fur.inner} />
          <ellipse cx="75.5" cy="16" rx="3.4" ry="12" transform="rotate(15 75.5 16)" fill={fur.inner} />
        </g>
      );
    case "cow":
      return (
        <g>
          <path d="M47,31 C43,19 35,13 29,16" fill="none" stroke={INK} strokeWidth="8.5" strokeLinecap="round" />
          <path d="M47,31 C43,19 35,13 29,16" fill="none" stroke="#EADFC1" strokeWidth="4.6" strokeLinecap="round" />
          <path d="M73,31 C77,19 85,13 91,16" fill="none" stroke={INK} strokeWidth="8.5" strokeLinecap="round" />
          <path d="M73,31 C77,19 85,13 91,16" fill="none" stroke="#EADFC1" strokeWidth="4.6" strokeLinecap="round" />
          <ellipse cx="31" cy="42" rx="11" ry="7" transform="rotate(-24 31 42)" fill={fur.main} stroke={INK} strokeWidth={3} />
          <ellipse cx="89" cy="42" rx="11" ry="7" transform="rotate(24 89 42)" fill={fur.main} stroke={INK} strokeWidth={3} />
          <ellipse cx="30" cy="42" rx="5" ry="3.2" transform="rotate(-24 30 42)" fill={fur.inner} />
          <ellipse cx="90" cy="42" rx="5" ry="3.2" transform="rotate(24 90 42)" fill={fur.inner} />
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
      {/* 奶牛：不对称花斑（含一只眼睛的花斑，更俏皮） */}
      {avatar === "cow" && (
        <g>
          <ellipse cx="45" cy="47" rx="13" ry="14" fill={PATCH} opacity={0.92} />
          <ellipse cx="79" cy="39" rx="8.5" ry="9.5" fill={PATCH} opacity={0.92} />
        </g>
      )}

      {avatar === "penguin" ? (
        <ellipse cx="60" cy="56" rx="21.5" ry="19.5" fill="#FFFFFF" />
      ) : (
        <>
          {(avatar === "bear" || avatar === "dog") && <ellipse cx="60" cy="64" rx="16.5" ry="10.5" fill={fur.light} />}
          {avatar === "cat" && <ellipse cx="60" cy="64.5" rx="13.5" ry="8.5" fill={fur.light} />}
          {avatar === "fox" && <ellipse cx="60" cy="64" rx="16.5" ry="10.5" fill={fur.light} />}
          {avatar === "bunny" && <ellipse cx="60" cy="64" rx="14" ry="9" fill={fur.light} opacity={0.75} />}
          {avatar === "mouse" && <ellipse cx="60" cy="64" rx="10" ry="7.5" fill={fur.light} opacity={0.85} />}
          {avatar === "donkey" && <ellipse cx="60" cy="64" rx="15" ry="11" fill={fur.light} />}
        </>
      )}

      {eye(48.5)}
      {eye(71.5)}

      {(avatar === "bear" || avatar === "dog" || avatar === "fox" || avatar === "penguin" || avatar === "donkey") && (
        <path d="M56.8,60.5 L63.2,60.5 L60,64.6 Z" fill={avatar === "penguin" ? "#FFAA33" : INK} stroke={INK} strokeWidth="1.1" strokeLinejoin="round" />
      )}
      {(avatar === "bunny" || avatar === "cat" || avatar === "mouse") && (
        <path d="M57.4,60.8 L62.6,60.8 L60,64.2 Z" fill="#FF7F98" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
      )}

      {(avatar === "donkey") && (
        <g>
          <ellipse cx="54.5" cy="62" rx="2" ry="2.6" fill={INK} opacity={0.9} />
          <ellipse cx="65.5" cy="62" rx="2" ry="2.6" fill={INK} opacity={0.9} />
        </g>
      )}

      {avatar === "cat" && (
        <g stroke={INK} strokeWidth="1.7" strokeLinecap="round" opacity="0.8">
          <path d="M34,62 L45,64" />
          <path d="M34.5,68 L45,68.5" />
          <path d="M86,62 L75,64" />
          <path d="M85.5,68 L75,68.5" />
        </g>
      )}
      {avatar === "mouse" && (
        <g stroke={INK} strokeWidth="1.6" strokeLinecap="round" opacity="0.8">
          <path d="M36,62 L46,63" />
          <path d="M36,67 L46,66.5" />
          <path d="M84,62 L74,63" />
          <path d="M84,67 L74,66.5" />
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

      {/* 猪：大鼻头，遮住嘴巴更可爱 */}
      {avatar === "pig" && (
        <g>
          <ellipse cx="60" cy="64" rx="10" ry="7" fill={fur.dark} stroke={INK} strokeWidth="2.4" />
          <ellipse cx="56.5" cy="64" rx="2" ry="2.8" fill={INK} />
          <ellipse cx="63.5" cy="64" rx="2" ry="2.8" fill={INK} />
        </g>
      )}

      {/* 河马：超宽大嘴 + 两颗小牙 */}
      {avatar === "hippo" && (
        <g>
          <ellipse cx="60" cy="65" rx="16" ry="9" fill={fur.light} stroke={INK} strokeWidth="2.4" />
          <ellipse cx="53" cy="64" rx="2.6" ry="3.4" fill={INK} />
          <ellipse cx="67" cy="64" rx="2.6" ry="3.4" fill={INK} />
          <path d="M54.5,72.5 L58,72.5 L58,75 L54.5,75 Z" fill="#FFFFFF" stroke={INK} strokeWidth="1.2" />
          <path d="M62,72.5 L65.5,72.5 L65.5,75 L62,75 Z" fill="#FFFFFF" stroke={INK} strokeWidth="1.2" />
        </g>
      )}

      {/* 野猪：鼻头 + 上翘獠牙 */}
      {avatar === "boar" && (
        <g>
          <ellipse cx="60" cy="64" rx="9.5" ry="6.8" fill={fur.dark} stroke={INK} strokeWidth="2.4" />
          <ellipse cx="56.8" cy="64" rx="1.9" ry="2.6" fill={INK} />
          <ellipse cx="63.2" cy="64" rx="1.9" ry="2.6" fill={INK} />
          <path d="M52,68 C45,64 41,54 46.5,49 C48.5,57 51,63 55,69 Z" fill="#FFF8E6" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <path d="M68,68 C75,64 79,54 73.5,49 C71.5,57 69,63 65,69 Z" fill="#FFF8E6" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        </g>
      )}

      {/* 奶牛：粉色大口鼻 */}
      {avatar === "cow" && (
        <g>
          <ellipse cx="60" cy="64" rx="15" ry="10" fill={fur.inner} stroke={INK} strokeWidth="2.2" />
          <ellipse cx="54" cy="64" rx="2.4" ry="3.1" fill={INK} />
          <ellipse cx="66" cy="64" rx="2.4" ry="3.1" fill={INK} />
        </g>
      )}

      {/* 小象：卷起的小鼻子 */}
      {avatar === "elephant" && (
        <g>
          <path d="M60,52 C61.5,60 63,66 57,68 C53,69.5 51,67 53,63.5" fill="none" stroke={INK} strokeWidth="11" strokeLinecap="round" />
          <path d="M60,52 C61.5,60 63,66 57,68 C53,69.5 51,67 53,63.5" fill="none" stroke={fur.main} strokeWidth="7" strokeLinecap="round" />
          <ellipse cx="53" cy="64" rx="1.7" ry="2.1" fill={INK} />
        </g>
      )}
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
  const key = (avatar && Object.prototype.hasOwnProperty.call(FUR, avatar) ? avatar : "bunny") as AvatarId;
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
      {key === "cow" && (
        <g>
          <ellipse cx="44" cy="90" rx="8.5" ry="7" fill={PATCH} opacity={0.9} />
          <ellipse cx="78" cy="99" rx="6" ry="5" fill={PATCH} opacity={0.9} />
        </g>
      )}
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
  left?: (Pick<Profile, "avatar" | "color"> & { mood?: Mood }) | null;
  right?: (Pick<Profile, "avatar" | "color"> & { mood?: Mood }) | null;
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
        {left ? <Critter avatar={left.avatar} color={left.color} size={size} mood={left.mood ?? "joy"} /> : <EmptySeat size={size} />}
      </div>
      <div className="couple-seat right">
        {right ? <Critter avatar={right.avatar} color={right.color} size={size} mood={right.mood ?? "joy"} /> : <EmptySeat size={size} />}
      </div>
    </div>
  );
}
