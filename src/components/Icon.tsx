import type { SVGProps } from "react";

type IconName =
  | "back"
  | "copy"
  | "check"
  | "share"
  | "qr"
  | "close"
  | "heart"
  | "moon"
  | "sun"
  | "sound"
  | "mute"
  | "undo"
  | "trash"
  | "users"
  | "wifi"
  | "refresh"
  | "send"
  | "sparkle"
  | "play"
  | "book"
  | "home"
  | "lock"
  | "pencil"
  | "clock"
  | "hand";

const S = 24;

export function Icon({
  name,
  size = 22,
  filled = false,
  ...rest
}: { name: IconName; size?: number; filled?: boolean } & Omit<SVGProps<SVGSVGElement>, "name">) {
  const common: SVGProps<SVGSVGElement> = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ...rest,
  };
  switch (name) {
    case "back":
      return (
        <svg {...common}>
          <path d="M15 5 L8 12 L15 19" />
        </svg>
      );
    case "copy":
      return (
        <svg {...common}>
          <rect x="9" y="9" width="11" height="11" rx="3" />
          <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6a3 3 0 0 0-3 3v6.5A2.5 2.5 0 0 0 5.5 15" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="M4.5 12.5 L9.5 17.5 L19.5 6.5" />
        </svg>
      );
    case "share":
      return (
        <svg {...common}>
          <circle cx="18" cy="5" r="2.6" />
          <circle cx="6" cy="12" r="2.6" />
          <circle cx="18" cy="19" r="2.6" />
          <path d="M8.4 10.8 L15.6 6.3 M8.4 13.2 L15.6 17.7" />
        </svg>
      );
    case "qr":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <path d="M14 14h3v3h-3zM20 14v2M14 20h2M19 19h2v2" />
        </svg>
      );
    case "close":
      return (
        <svg {...common}>
          <path d="M6 6 L18 18 M18 6 L6 18" />
        </svg>
      );
    case "heart":
      return (
        <svg {...common} fill={filled ? "currentColor" : "none"}>
          <path d="M12 20s-7.5-4.6-7.5-9.6A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 7.5 3.2C19.5 15.4 12 20 12 20Z" />
        </svg>
      );
    case "moon":
      return (
        <svg {...common}>
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
        </svg>
      );
    case "sun":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      );
    case "sound":
      return (
        <svg {...common}>
          <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4Z" />
          <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />
        </svg>
      );
    case "mute":
      return (
        <svg {...common}>
          <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4Z" />
          <path d="M16.5 9.5 L21 14 M21 9.5 L16.5 14" />
        </svg>
      );
    case "undo":
      return (
        <svg {...common}>
          <path d="M9 8H5v-4" />
          <path d="M5 8a8 8 0 1 1 1.5 9.5" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common}>
          <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.8 20c.4-3.6 2.9-5.5 6.2-5.5s5.8 1.9 6.2 5.5" />
          <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M17.5 14.7c2.2.6 3.5 2.4 3.7 5.3" />
        </svg>
      );
    case "wifi":
      return (
        <svg {...common}>
          <path d="M3 9.5a13 13 0 0 1 18 0M6.5 13a8 8 0 0 1 11 0M10 16.5a3 3 0 0 1 4 0" />
          <circle cx="12" cy="20" r="0.8" fill="currentColor" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common}>
          <path d="M20 11a8 8 0 1 0-2.3 6.7" />
          <path d="M20 4v7h-7" />
        </svg>
      );
    case "send":
      return (
        <svg {...common}>
          <path d="M4 11.5 L20 4 L15.5 20 L11.5 13.5 Z" />
          <path d="M11.5 13.5 L20 4" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...common}>
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" />
          <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" />
        </svg>
      );
    case "play":
      return (
        <svg {...common} fill="currentColor">
          <path d="M8 5.5v13l11-6.5Z" stroke="none" />
        </svg>
      );
    case "book":
      return (
        <svg {...common}>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22Z" />
          <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v17h4.5A2.5 2.5 0 0 1 20 22Z" />
        </svg>
      );
    case "home":
      return (
        <svg {...common}>
          <path d="M3.5 11 L12 3.5 L20.5 11" />
          <path d="M5.5 9.5V20h13V9.5" />
          <path d="M10 20v-5h4v5" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="4.5" y="10" width="15" height="10.5" rx="3" />
          <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
        </svg>
      );
    case "pencil":
      return (
        <svg {...common}>
          <path d="M4 20l1-4.5L16.5 4a2.1 2.1 0 0 1 3 3L8 18.5Z" />
          <path d="M14.5 6.5l3 3" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5.5l3.5 2" />
        </svg>
      );
    case "hand":
      return (
        <svg {...common}>
          <path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V12M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5A6 6 0 0 1 4 15v-3a1.5 1.5 0 0 1 3 0v2" />
        </svg>
      );
    default:
      return null;
  }
}