/** Decorative Southwest Florida sunset for the foot of the sidebar: sky
 * fading from the navy shell into coral and gold, a setting sun on the Gulf
 * horizon, layered waves and one palm silhouette. Anchored to the bottom and
 * cropped from the top when the foot is short. Purely ornamental, hidden from
 * assistive tech. */
export default function SunsetArt() {
  return (
    <svg
      className="sunset-art"
      viewBox="0 0 280 385"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="sunset-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#142D4E" stopOpacity="0" />
          <stop offset="0.3" stopColor="#344463" stopOpacity="0.9" />
          <stop offset="0.6" stopColor="#7a5c74" />
          <stop offset="0.8" stopColor="#FF896C" />
          <stop offset="0.92" stopColor="#FFB16D" />
          <stop offset="1" stopColor="#FFD49C" />
        </linearGradient>
        <radialGradient id="sunset-glow">
          <stop offset="0" stopColor="#FFD49C" stopOpacity="0.75" />
          <stop offset="1" stopColor="#FFB16D" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="sunset-sun" cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#FFF1D6" />
          <stop offset="0.55" stopColor="#FFD49C" />
          <stop offset="1" stopColor="#FFB16D" />
        </radialGradient>
        <linearGradient id="sunset-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5a5470" />
          <stop offset="0.4" stopColor="#2c3d5e" />
          <stop offset="1" stopColor="#142D4E" />
        </linearGradient>
      </defs>

      {/* sky down to the horizon (y = 250) */}
      <rect width="280" height="252" fill="url(#sunset-sky)" />
      <circle cx="182" cy="250" r="86" fill="url(#sunset-glow)" />
      <circle cx="182" cy="250" r="30" fill="url(#sunset-sun)" />

      {/* far shoreline */}
      <path d="M118 250c14-3 30-5 44-3 9 1 15 3 22 3z" fill="#4a3f5c" opacity="0.55" />

      {/* gulf, with the sun's reflection */}
      <rect y="250" width="280" height="135" fill="url(#sunset-sea)" />
      <g stroke="#FFC98F" strokeLinecap="round">
        <path d="M160 256h44" strokeWidth="2" opacity="0.7" />
        <path d="M166 262h32" strokeWidth="1.6" opacity="0.55" />
        <path d="M171 269h22" strokeWidth="1.4" opacity="0.45" />
        <path d="M175 277h14" strokeWidth="1.2" opacity="0.35" />
        <path d="M178 285h8" strokeWidth="1" opacity="0.25" />
      </g>

      {/* layered waves */}
      <path
        d="M0 300c22-6 40-6 60 0s40 6 62 0 42-7 64-1 44 7 64 1 22-4 30-3v88H0z"
        fill="#21385c"
        opacity="0.9"
      />
      <path d="M0 326c26-5 48-4 70 1s46 5 70 0 48-5 72 0 44 4 68-1v59H0z" fill="#172f50" />

      {/* palm: dune, trunk, fronds */}
      <g fill="#0c1a2d">
        <path d="M0 334c34-12 84-12 132 8v43H0z" />
        <path d="M83 124c-4 56-13 130-28 222h13c13-92 21-164 24-221z" />
        <path
          d="M76 172h6M74 196h7M72 220h7M69 246h8M66 272h8M63 298h8M60 322h8"
          stroke="#1d3150"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <circle cx="84" cy="129" r="3.4" />
        <circle cx="90.5" cy="130" r="3.4" />
        <circle cx="87" cy="134.5" r="3" />
        <path d="M88 122c-26-18-60-16-84 16 26-22 56-24 84-11z" />
        <path d="M88 122c-20-26-48-38-70-34 24 4 46 16 68 38z" />
        <path d="M88 122c-8-30-22-50-38-60 18 16 30 36 35 62z" />
        <path d="M88 122c10-30 28-46 50-50-22 12-36 28-47 52z" />
        <path d="M88 122c28-20 62-20 84-6-26-6-54-2-82 10z" />
        <path d="M88 122c30-4 58 10 72 40-20-24-44-34-71-35z" />
        <path d="M88 122c-20 4-42 20-52 48 16-24 34-36 51-43z" />
      </g>
    </svg>
  );
}
