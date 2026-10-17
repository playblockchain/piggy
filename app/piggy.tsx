import fs from "node:fs";
import path from "node:path";
import type { Mood } from "@/lib/types";

/**
 * Lil Piggy, drawn from the brand sheet: soft pink blob, thin dark outline,
 * chubby round body, blush cheeks, tiny props. Seven expressions.
 *
 * This is still vector stand-in art. When the real illustrations land as
 * files, swap this component for <img> and keep the same mood prop.
 */

const LABEL: Record<Mood, string> = {
  happy: "content",
  excited: "excited",
  proud: "proud, wearing a crown",
  curious: "curious",
  suspicious: "suspicious",
  sad: "sad",
  unhinged: "unhinged",
};

function Face({ mood }: { mood: Mood }) {
  const ink = "var(--ink)";

  if (mood === "happy" || mood === "excited") {
    // Closed, upturned eyes — the "^ ^" of the reference sheet.
    return (
      <>
        <path d="M62 88 q6 -7 12 0" stroke={ink} strokeWidth="3" strokeLinecap="round" fill="none" />
        <path d="M86 88 q6 -7 12 0" stroke={ink} strokeWidth="3" strokeLinecap="round" fill="none" />
      </>
    );
  }
  if (mood === "unhinged") {
    return (
      <>
        <path d="M62 83 l12 11 M74 83 l-12 11" stroke={ink} strokeWidth="2.8" strokeLinecap="round" />
        <path d="M86 83 l12 11 M98 83 l-12 11" stroke={ink} strokeWidth="2.8" strokeLinecap="round" />
      </>
    );
  }
  if (mood === "suspicious") {
    // Flat, narrowed eyes.
    return (
      <>
        <path d="M62 89 h12" stroke={ink} strokeWidth="3.2" strokeLinecap="round" />
        <path d="M86 89 h12" stroke={ink} strokeWidth="3.2" strokeLinecap="round" />
      </>
    );
  }
  return (
    <>
      <ellipse cx="68" cy="88" rx="4" ry="4.6" fill={ink} />
      <ellipse cx="92" cy="88" rx="4" ry="4.6" fill={ink} />
    </>
  );
}

function Prop({ mood }: { mood: Mood }) {
  const ink = "var(--ink)";

  switch (mood) {
    case "proud":
      return (
        <path
          d="M62 48 L70 60 L80 44 L90 60 L98 48 L95 64 L65 64 Z"
          fill="var(--dot-1)"
          stroke={ink}
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
      );
    case "happy":
      return (
        <path
          d="M80 40 c-4 -6 -13 -2 -10 5 c2 5 10 9 10 9 s8 -4 10 -9 c3 -7 -6 -11 -10 -5 z"
          fill="var(--s1)"
          stroke={ink}
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
      );
    case "excited":
      return (
        <g stroke={ink} strokeWidth="2.2" strokeLinecap="round">
          <path d="M50 58 v8 M46 62 h8" />
          <path d="M110 54 v8 M106 58 h8" />
          <path d="M80 42 v7 M76.5 45.5 h7" />
        </g>
      );
    case "curious":
      return (
        <text
          x="108"
          y="56"
          fontSize="26"
          fontWeight="600"
          fill={ink}
          fontFamily="var(--font-pixel-stack)"
        >
          ?
        </text>
      );
    case "suspicious":
      return (
        <g fill={ink}>
          <circle cx="104" cy="54" r="2.6" />
          <circle cx="113" cy="54" r="2.6" />
          <circle cx="122" cy="54" r="2.6" />
        </g>
      );
    case "unhinged":
      return (
        <path
          d="M56 52 L80 34 L104 52 L98 60 L62 60 Z"
          fill="var(--panel-grid)"
          stroke={ink}
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
      );
    default:
      return null;
  }
}

function PiggyVector({ mood, size = 160 }: { mood: Mood; size?: number }) {
  const ink = "var(--ink)";
  // Piggy shrinks as the habits get worse — the brand sheet's whole premise.
  const scale =
    mood === "proud" || mood === "excited"
      ? 1
      : mood === "happy"
        ? 0.97
        : mood === "curious" || mood === "suspicious"
          ? 0.92
          : mood === "sad"
            ? 0.84
            : 0.76;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      role="img"
      aria-label={`Lil Piggy looking ${LABEL[mood]}`}
      style={{ display: "block" }}
    >
      {/* soft blob */}
      <path
        d="M80 16 c34 0 60 20 62 48 c2 28 -16 56 -46 62 c-30 6 -58 -4 -70 -26 c-12 -22 -8 -56 14 -70 c12 -8 24 -14 40 -14 z"
        fill="var(--content-pink)"
      />

      <g transform={`translate(80 92) scale(${scale}) translate(-80 -92)`}>
        <Prop mood={mood} />

        {/* ears */}
        <path d="M50 70 L57 50 L72 62 Z" fill="var(--panel)" stroke={ink} strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M110 70 L103 50 L88 62 Z" fill="var(--panel)" stroke={ink} strokeWidth="2.6" strokeLinejoin="round" />

        {/* body */}
        <ellipse cx="80" cy="94" rx="44" ry="38" fill="var(--panel)" stroke={ink} strokeWidth="2.8" />

        {/* blush */}
        <ellipse cx="50" cy="99" rx="7.5" ry="5" fill="var(--s1)" />
        <ellipse cx="110" cy="99" rx="7.5" ry="5" fill="var(--s1)" />

        <Face mood={mood} />

        {mood === "sad" && (
          <>
            <path d="M68 95 q2 9 -1 15" stroke="var(--s1)" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d="M92 95 q2 9 -1 15" stroke="var(--s1)" strokeWidth="3" strokeLinecap="round" fill="none" />
          </>
        )}

        {/* snout */}
        <ellipse cx="80" cy="106" rx="16" ry="11" fill="var(--panel)" stroke={ink} strokeWidth="2.6" />
        <ellipse cx="75" cy="106" rx="2.4" ry="3.6" fill={ink} />
        <ellipse cx="85" cy="106" rx="2.4" ry="3.6" fill={ink} />

        {/* mouth */}
        {mood === "sad" || mood === "unhinged" ? (
          <path d="M70 122 q10 -8 20 0" stroke={ink} strokeWidth="2.6" strokeLinecap="round" fill="none" />
        ) : mood === "happy" || mood === "excited" || mood === "proud" ? (
          <path d="M70 120 q10 8 20 0" stroke={ink} strokeWidth="2.6" strokeLinecap="round" fill="none" />
        ) : null}
      </g>
    </svg>
  );
}

/**
 * Drop real illustrations into `public/piggy/` named after the mood —
 * `proud.png`, `sad.webp`, `unhinged.svg` and so on — and each one replaces
 * its vector stand-in as soon as it lands. Moods with no file keep the vector,
 * so the set can arrive one file at a time without ever showing a broken image.
 *
 * The lookup runs on the server at render time, which is why this component
 * must stay a server component.
 */
const ASSET_DIR = path.join(process.cwd(), "public", "piggy");
const EXTENSIONS = [".png", ".webp", ".svg", ".jpg", ".jpeg", ".gif"];

function findAsset(mood: Mood): string | null {
  for (const ext of EXTENSIONS) {
    const file = `${mood}${ext}`;
    try {
      if (fs.existsSync(path.join(ASSET_DIR, file))) return `/piggy/${file}`;
    } catch {
      // A filesystem that cannot be read is the same as no asset: use the vector.
      return null;
    }
  }
  return null;
}

const LABEL_FOR: Record<Mood, string> = LABEL;

export function Piggy({ mood, size = 160 }: { mood: Mood; size?: number }) {
  const src = findAsset(mood);
  if (!src) return <PiggyVector mood={mood} size={size} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      width={size}
      height={size}
      alt={`Lil Piggy looking ${LABEL_FOR[mood]}`}
      style={{ display: "block", width: size, height: "auto" }}
    />
  );
}
