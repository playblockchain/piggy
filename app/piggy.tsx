import fs from "node:fs";
import path from "node:path";
import type { Mood, Scenario } from "@/lib/types";
import { Face, MOOD_LABEL, Mouth, SCENARIO_LABEL, ScenarioProp } from "./piggy-art";

/**
 * Lil Piggy. Soft pink blob, thin plum outline, chubby body, blush cheeks.
 *
 * Mood drives the face, scenario drives the props, and size drives the
 * shrinking: he is full size when proud and visibly smaller when it has all
 * gone wrong. Vector stand-in until the real illustrations land in
 * public/piggy/ — see that folder's README.
 */

const ASSET_DIR = path.join(process.cwd(), "public", "piggy");
const EXTENSIONS = [".png", ".webp", ".svg", ".jpg", ".jpeg", ".gif"];

/**
 * A scenario-specific file wins over a mood-only one, so `raiding_savings.png`
 * beats `sad.png`. Either can be dropped in alone.
 */
function findAsset(mood: Mood, scenario?: Scenario): string | null {
  const names = scenario && scenario !== "unknown" ? [scenario, mood] : [mood];
  for (const name of names) {
    for (const ext of EXTENSIONS) {
      try {
        if (fs.existsSync(path.join(ASSET_DIR, `${name}${ext}`))) return `/piggy/${name}${ext}`;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function describe(mood: Mood, scenario?: Scenario): string {
  const base = `Lil Piggy looking ${MOOD_LABEL[mood]}`;
  if (!scenario || scenario === "unknown") return base;
  return `${base}, ${SCENARIO_LABEL[scenario]}`;
}

export function Piggy({
  mood,
  scenario,
  size = 160,
}: {
  mood: Mood;
  scenario?: Scenario;
  size?: number;
}) {
  const src = findAsset(mood, scenario);
  const label = describe(mood, scenario);

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        width={size}
        height={size}
        alt={label}
        style={{ display: "block", width: size, height: "auto" }}
      />
    );
  }

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
    <svg width={size} height={size} viewBox="0 0 160 160" role="img" aria-label={label} style={{ display: "block" }}>
      <path
        d="M80 16 c34 0 60 20 62 48 c2 28 -16 56 -46 62 c-30 6 -58 -4 -70 -26 c-12 -22 -8 -56 14 -70 c12 -8 24 -14 40 -14 z"
        fill="var(--content-pink)"
      />

      <g transform={`translate(80 92) scale(${scale}) translate(-80 -92)`}>
        {scenario && <ScenarioProp scenario={scenario} />}

        {/* ears */}
        <path d="M50 70 L57 50 L72 62 Z" fill="var(--panel)" stroke="var(--ink)" strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M110 70 L103 50 L88 62 Z" fill="var(--panel)" stroke="var(--ink)" strokeWidth="2.6" strokeLinejoin="round" />

        {/* body */}
        <ellipse cx="80" cy="94" rx="44" ry="38" fill="var(--panel)" stroke="var(--ink)" strokeWidth="2.8" />

        {/* blush */}
        <ellipse cx="50" cy="99" rx="7.5" ry="5" fill="var(--s1)" />
        <ellipse cx="110" cy="99" rx="7.5" ry="5" fill="var(--s1)" />

        <Face mood={mood} />

        {/* snout */}
        <ellipse cx="80" cy="106" rx="16" ry="11" fill="var(--panel)" stroke="var(--ink)" strokeWidth="2.6" />
        <ellipse cx="75" cy="106" rx="2.4" ry="3.6" fill="var(--ink)" />
        <ellipse cx="85" cy="106" rx="2.4" ry="3.6" fill="var(--ink)" />

        <Mouth mood={mood} />
      </g>
    </svg>
  );
}
