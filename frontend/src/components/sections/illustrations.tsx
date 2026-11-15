/**
 * Lightweight inline illustrations used across sections. Kept as pure
 * SVG so panels stay crisp at any size with zero asset weight.
 */

/** Abstract ID-card line illustration (Trust Problem section). */
export function IdCardIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 613 416"
      fill="none"
      aria-hidden
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Card */}
      <rect
        x="96"
        y="72"
        width="420"
        height="272"
        rx="24"
        fill="white"
        stroke="#0E3228"
        strokeOpacity="0.14"
        strokeWidth="2"
      />
      {/* Portrait */}
      <rect x="128" y="112" width="120" height="150" rx="14" fill="#F2F2F2" />
      <circle cx="188" cy="164" r="26" fill="#0E3228" fillOpacity="0.16" />
      <path
        d="M148 244c8-26 26-38 40-38s32 12 40 38"
        stroke="#0E3228"
        strokeOpacity="0.25"
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* Data lines */}
      <rect
        x="276"
        y="120"
        width="180"
        height="14"
        rx="7"
        fill="#0E3228"
        fillOpacity="0.14"
      />
      <rect
        x="276"
        y="152"
        width="132"
        height="14"
        rx="7"
        fill="#0E3228"
        fillOpacity="0.1"
      />
      <rect
        x="276"
        y="184"
        width="158"
        height="14"
        rx="7"
        fill="#0E3228"
        fillOpacity="0.1"
      />
      <rect
        x="276"
        y="216"
        width="104"
        height="14"
        rx="7"
        fill="#0E3228"
        fillOpacity="0.08"
      />
      {/* MRZ */}
      <rect
        x="128"
        y="288"
        width="356"
        height="12"
        rx="6"
        fill="#0E3228"
        fillOpacity="0.16"
      />
      <rect
        x="128"
        y="310"
        width="300"
        height="12"
        rx="6"
        fill="#0E3228"
        fillOpacity="0.1"
      />
      {/* Chip */}
      <rect x="276" y="244" width="44" height="34" rx="8" fill="#BFEB58" />
      <path
        d="M284 261h28M298 244v34"
        stroke="#0E3228"
        strokeOpacity="0.5"
        strokeWidth="2"
      />
      {/* Shield check */}
      <g filter="url(#shadow)">
        <path
          d="M472 232c26 8 46 8 72 0v54c0 30-22 52-36 58-14-6-36-28-36-58v-54z"
          fill="#0E3228"
        />
        <path
          d="M490 288l14 14 26-30"
          stroke="#BFEB58"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      {/* Scan beam */}
      <rect
        x="96"
        y="188"
        width="420"
        height="4"
        rx="2"
        fill="#BFEB58"
        fillOpacity="0.9"
      />
      <rect x="96" y="178" width="420" height="24" fill="url(#beam)" />
      <defs>
        <linearGradient
          id="beam"
          x1="0"
          y1="178"
          x2="0"
          y2="202"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#BFEB58" stopOpacity="0" />
          <stop offset="0.5" stopColor="#BFEB58" stopOpacity="0.35" />
          <stop offset="1" stopColor="#BFEB58" stopOpacity="0" />
        </linearGradient>
        <filter
          id="shadow"
          x="452"
          y="220"
          width="112"
          height="152"
          filterUnits="userSpaceOnUse"
        >
          <feDropShadow
            dx="0"
            dy="10"
            stdDeviation="10"
            floodColor="#0E3228"
            floodOpacity="0.25"
          />
        </filter>
      </defs>
    </svg>
  );
}

/** Step-card mockups: tiny product moments instead of grey placeholders. */
export function StepWorkflowMock() {
  return (
    <div
      aria-hidden
      className="flex h-full w-full flex-col justify-center gap-2.5 p-8"
    >
      {["Document", "NFC Chip", "Face Match", "Liveness", "AML"].map(
        (chip, i) => (
          <div
            key={chip}
            className="flex items-center gap-3 rounded-full border border-pine/10 bg-white px-4 py-2.5"
            style={{ marginLeft: i * 14 }}
          >
            <span className="size-2.5 rounded-full bg-lime" />
            <span className="text-sm text-pine">{chip}</span>
          </div>
        ),
      )}
    </div>
  );
}

export function StepApiMock() {
  return (
    <div
      aria-hidden
      className="flex h-full w-full items-center justify-center p-8"
    >
      <div className="w-full rounded-2xl bg-pine p-5 font-mono text-sm leading-7 text-white/90 shadow-lg">
        <p>
          <span className="text-lime">POST</span> /kyc/verify
        </p>
        <p className="text-white/60">{"{"}</p>
        <p className="pl-4 text-white/80">
          &quot;workflow&quot;:{" "}
          <span className="text-lime">&quot;onboarding&quot;</span>,
        </p>
        <p className="pl-4 text-white/80">
          &quot;document&quot;: <span className="text-lime">&quot;…&quot;</span>
        </p>
        <p className="text-white/60">{"}"}</p>
      </div>
    </div>
  );
}

export function StepSealMock() {
  return (
    <div
      aria-hidden
      className="flex h-full w-full items-center justify-center gap-5 p-8"
    >
      <div className="relative flex size-28 items-center justify-center rounded-full border-[6px] border-lime bg-white shadow-md">
        <span className="text-3xl font-medium text-pine">98</span>
        <span className="absolute -bottom-2 rounded-full bg-pine px-2.5 py-0.5 text-[10px] tracking-wide text-lime">
          TRUST SEAL
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {["Document", "Chip", "Face", "Liveness", "AML"].map((badge) => (
          <div key={badge} className="flex items-center gap-2">
            <span className="flex size-4 items-center justify-center rounded-full bg-lime text-[9px] font-bold text-pine">
              ✓
            </span>
            <span className="text-xs text-pine/80">{badge}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
