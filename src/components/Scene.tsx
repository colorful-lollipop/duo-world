export function Scene({ variant = "day" }: { variant?: "day" | "night" }) {
  const night = variant === "night";
  const stars = [
    [8, 12],
    [18, 26],
    [28, 8],
    [37, 20],
    [46, 11],
    [55, 27],
    [64, 7],
    [73, 18],
    [82, 10],
    [91, 24],
    [13, 38],
    [33, 34],
    [58, 37],
    [78, 33],
    [96, 40],
  ];
  return (
    <div className={`scene scene-${variant}`} aria-hidden="true">
      {night ? (
        <>
          {stars.map(([x, y], i) => (
            <span
              key={i}
              className="star"
              style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${(i % 5) * 0.7}s`, transform: `scale(${0.6 + (i % 3) * 0.35})` }}
            />
          ))}
          <svg className="moon" viewBox="0 0 90 90">
            <circle cx="45" cy="45" r="27" fill="#FFE58A" stroke="#3A2618" strokeWidth="3" />
            <circle cx="36" cy="37" r="4.5" fill="#F5CF5C" />
            <circle cx="54" cy="54" r="6" fill="#F5CF5C" />
            <path d="M35,50 Q39.5,54 44,50 M47,50 Q51.5,54 56,50" fill="none" stroke="#3A2618" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </>
      ) : (
        <>
          <span className="sun" />
          <Cloud className="cloud c1" />
          <Cloud className="cloud c2" />
          <Cloud className="cloud c3" />
          <Cloud className="cloud c4" />
        </>
      )}
      <svg className="hills" viewBox="0 0 400 160" preserveAspectRatio="none">
        <path
          d="M0,62 C55,18 125,8 196,58 C246,26 330,6 400,48 L400,160 L0,160 Z"
          fill={night ? "#2E4A78" : "#A6E07A"}
          stroke={night ? "#1C2D4E" : "#5DAF3C"}
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M0,104 C70,66 150,74 214,100 C276,72 344,64 400,94 L400,160 L0,160 Z"
          fill={night ? "#22385A" : "#79CC50"}
          stroke={night ? "#16233C" : "#3F9A2C"}
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

function Cloud({ className = "" }: { className?: string }) {
  return (
    <svg className={"cloud " + className} viewBox="0 0 120 60">
      <path
        d="M24,52C12,52 6,44 9,36C11,29 18,27 23,29C24,18 34,11 45,13C52,6 66,6 73,15C82,11 95,16 96,28C105,29 112,36 110,44C108,50 103,52 97,52Z"
        fill="#FFFFFF"
        stroke="#A7D5F5"
        strokeWidth="3"
      />
      <path d="M14,46C30,50 80,51 104,46C102,50 99,52 96,52L24,52C19,52 16,50 14,46Z" fill="#E4F3FF" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg className={"logo " + className} viewBox="0 0 360 172" role="img" aria-label="二人世界">
      <defs>
        <linearGradient id="logo-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF7AE" />
          <stop offset="0.42" stopColor="#FFD23F" />
          <stop offset="1" stopColor="#FF8C1A" />
        </linearGradient>
        <linearGradient id="logo-green" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F1FF9A" />
          <stop offset="0.5" stopColor="#A5E24C" />
          <stop offset="1" stopColor="#5CB82C" />
        </linearGradient>
      </defs>
      <text
        x="180"
        y="52"
        textAnchor="middle"
        fontSize="40"
        fontWeight="800"
        fill="url(#logo-green)"
        stroke="#2F6B12"
        strokeWidth="10"
        strokeLinejoin="round"
        paintOrder="stroke"
        style={{ fontFamily: "var(--display)" }}
      >
        情侣双人
      </text>
      <text
        x="180"
        y="146"
        textAnchor="middle"
        fontSize="84"
        fontWeight="900"
        fill="url(#logo-gold)"
        stroke="#6B2E05"
        strokeWidth="13"
        strokeLinejoin="round"
        paintOrder="stroke"
        style={{ fontFamily: "var(--display)" }}
      >
        二人世界
      </text>
      <path
        d="M312,26 c-4,-7 -15,-4 -15,4 c0,7 11,12 15,15 c4,-3 15,-8 15,-15 c0,-8 -11,-11 -15,-4z"
        fill="#FF6B6B"
        stroke="#3A2618"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M48,30 l3,7 7,3 -7,3 -3,7 -3,-7 -7,-3 7,-3z" fill="#FFF7AE" stroke="#3A2618" strokeWidth="2" />
    </svg>
  );
}