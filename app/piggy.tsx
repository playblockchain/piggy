import type { Mood } from "@/lib/types";

const MOOD_TOKEN: Record<Mood, string> = {
  proud: "var(--proud)",
  okay: "var(--okay)",
  sad: "var(--sad)",
  unhinged: "var(--unhinged)",
};

/**
 * Placeholder artwork: geometric, legible at small sizes, and easy to swap for
 * real illustration. Size reflects mood — Piggy grows when the habits are good
 * and shrinks when they are not.
 */
export function Piggy({ mood, size = 160 }: { mood: Mood; size?: number }) {
  const scale = mood === "proud" ? 1 : mood === "okay" ? 0.92 : mood === "sad" ? 0.82 : 0.72;
  const accent = MOOD_TOKEN[mood];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      role="img"
      aria-label={`Piggy looking ${mood}`}
      style={{ display: "block" }}
    >
      <g transform={`translate(80 86) scale(${scale}) translate(-80 -86)`}>
        {mood === "proud" && (
          <path
            d="M54 36 L66 52 L80 32 L94 52 L106 36 L102 58 L58 58 Z"
            fill={accent}
            stroke="var(--text-strong)"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        )}
        {mood === "unhinged" && (
          <path
            d="M50 40 L80 24 L110 40 L104 52 L56 52 Z"
            fill="var(--surface-2)"
            stroke="var(--text-strong)"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        )}

        {/* ears */}
        <path d="M46 62 L52 40 L70 54 Z" fill="var(--accent-soft)" stroke="var(--text-strong)" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M114 62 L108 40 L90 54 Z" fill="var(--accent-soft)" stroke="var(--text-strong)" strokeWidth="2.5" strokeLinejoin="round" />

        {/* head */}
        <ellipse cx="80" cy="92" rx="46" ry="40" fill="var(--accent-soft)" stroke="var(--text-strong)" strokeWidth="2.5" />

        {/* eyes */}
        {mood === "unhinged" ? (
          <>
            <path d="M60 84 l12 10 M72 84 l-12 10" stroke="var(--text-strong)" strokeWidth="3" strokeLinecap="round" />
            <path d="M88 84 l12 10 M100 84 l-12 10" stroke="var(--text-strong)" strokeWidth="3" strokeLinecap="round" />
          </>
        ) : mood === "okay" ? (
          <>
            <path d="M58 88 h14" stroke="var(--text-strong)" strokeWidth="3.5" strokeLinecap="round" />
            <path d="M88 88 h14" stroke="var(--text-strong)" strokeWidth="3.5" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="65" cy="87" r="4.5" fill="var(--text-strong)" />
            <circle cx="95" cy="87" r="4.5" fill="var(--text-strong)" />
          </>
        )}

        {mood === "sad" && (
          <path d="M65 94 q2 10 -2 16" stroke={accent} strokeWidth="3" strokeLinecap="round" fill="none" />
        )}

        {/* snout */}
        <ellipse cx="80" cy="106" rx="19" ry="13" fill="var(--surface)" stroke="var(--text-strong)" strokeWidth="2.5" />
        <ellipse cx="74" cy="106" rx="3" ry="4.5" fill="var(--text-strong)" />
        <ellipse cx="86" cy="106" rx="3" ry="4.5" fill="var(--text-strong)" />

        {/* mouth */}
        <path
          d={
            mood === "proud"
              ? "M64 120 q16 12 32 0"
              : mood === "okay"
                ? "M68 121 h24"
                : "M64 124 q16 -12 32 0"
          }
          stroke="var(--text-strong)"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      </g>
    </svg>
  );
}
