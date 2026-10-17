import type { Mood, Scenario } from "@/lib/types";

/**
 * Lil Piggy's face and props.
 *
 * Two layers, because they say different things:
 *   MOOD     — the eyes and mouth. How he feels about you.
 *   SCENARIO — the props around him. What you actually did.
 *
 * So "sad + raiding savings" is a crying pig next to a cracked jar, while
 * "sad + memecoins" is a crying pig clutching a phone. Same feeling, different
 * crime. Scenario props take the stage when there is one, because what you did
 * is more specific than how he feels about it.
 */

const INK = "var(--ink)";
const BODY = "var(--panel)";
const BLUSH = "var(--s1)";
const GOLD = "var(--dot-1)";
const MINT = "var(--bar-green)";
const SKY = "var(--bar-blue)";

export const MOOD_LABEL: Record<Mood, string> = {
  happy: "content",
  excited: "delighted",
  proud: "proud, wearing a crown",
  curious: "curious",
  suspicious: "narrow-eyed and suspicious",
  sad: "tearful",
  unhinged: "completely unhinged",
};

export const SCENARIO_LABEL: Record<Scenario, string> = {
  dca_saving: "dropping a coin into his own slot",
  staking_yield: "in a spa robe with cucumber slices on",
  healthy_portfolio: "surrounded by neat stacks of coins",
  buying_memecoins: "glued to a phone",
  perps_leverage: "in a tinfoil hat",
  gambling: "holding a fan of cards",
  raiding_savings: "beside a cracked jar",
  empty_wallet: "with nothing at all",
  unknown: "unreadable",
};

/** Eyes and mouth: how he feels. */
export function Face({ mood }: { mood: Mood }) {
  if (mood === "happy" || mood === "excited") {
    return (
      <>
        <path d="M62 88 q6 -7 12 0" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />
        <path d="M86 88 q6 -7 12 0" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />
      </>
    );
  }
  if (mood === "unhinged") {
    // Spiral eyes: the lights are on, nobody is home.
    return (
      <>
        <path
          d="M68 88 m-5 0 a5 5 0 1 1 5 5 a3 3 0 1 1 -3 -3"
          stroke={INK}
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M92 88 m-5 0 a5 5 0 1 1 5 5 a3 3 0 1 1 -3 -3"
          stroke={INK}
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
        />
      </>
    );
  }
  if (mood === "suspicious") {
    return (
      <>
        <path d="M61 86 l13 3" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        <path d="M99 86 l-13 3" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="68" cy="91" rx="3" ry="2.6" fill={INK} />
        <ellipse cx="92" cy="91" rx="3" ry="2.6" fill={INK} />
      </>
    );
  }
  if (mood === "sad") {
    return (
      <>
        <path d="M61 84 q7 -4 13 1" stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none" />
        <path d="M99 84 q-7 -4 -13 1" stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none" />
        <ellipse cx="68" cy="91" rx="4" ry="4.4" fill={INK} />
        <ellipse cx="92" cy="91" rx="4" ry="4.4" fill={INK} />
        <path d="M66 97 q-2 8 1 12" stroke={SKY} strokeWidth="3" strokeLinecap="round" fill="none" />
        <path d="M94 97 q2 8 -1 12" stroke={SKY} strokeWidth="3" strokeLinecap="round" fill="none" />
      </>
    );
  }
  if (mood === "curious") {
    return (
      <>
        <ellipse cx="68" cy="88" rx="4.4" ry="5" fill={INK} />
        <ellipse cx="92" cy="88" rx="4.4" ry="5" fill={INK} />
        <circle cx="69.6" cy="86.4" r="1.5" fill={BODY} />
        <circle cx="93.6" cy="86.4" r="1.5" fill={BODY} />
      </>
    );
  }
  return (
    <>
      <ellipse cx="68" cy="88" rx="4" ry="4.6" fill={INK} />
      <ellipse cx="92" cy="88" rx="4" ry="4.6" fill={INK} />
    </>
  );
}

export function Mouth({ mood }: { mood: Mood }) {
  if (mood === "sad" || mood === "unhinged") {
    return <path d="M70 122 q10 -8 20 0" stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none" />;
  }
  if (mood === "happy" || mood === "excited" || mood === "proud") {
    return <path d="M70 120 q10 8 20 0" stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none" />;
  }
  if (mood === "suspicious") {
    return <path d="M72 121 h16" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />;
  }
  return null;
}

const Coin = ({ x, y, r = 7 }: { x: number; y: number; r?: number }) => (
  <g>
    <circle cx={x} cy={y} r={r} fill={GOLD} stroke={INK} strokeWidth="2.2" />
    <path d={`M${x} ${y - r / 2} v${r}`} stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
  </g>
);

/** Props: what you actually did. */
export function ScenarioProp({ scenario }: { scenario: Scenario }) {
  switch (scenario) {
    case "dca_saving":
      // A coin going in, and the slot it goes into.
      return (
        <>
          <rect x="68" y="52" width="24" height="5" rx="2.5" fill={BODY} stroke={INK} strokeWidth="2.2" />
          <Coin x={80} y={34} />
          <path d="M80 42 v6" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeDasharray="3 3" />
        </>
      );
    case "staking_yield":
      // Spa robe collar, cucumber slices, two curls of steam.
      return (
        <>
          <path d="M44 120 l14 -10 M116 120 l-14 -10" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="68" cy="88" r="7" fill={MINT} stroke={INK} strokeWidth="2.2" />
          <circle cx="92" cy="88" r="7" fill={MINT} stroke={INK} strokeWidth="2.2" />
          <path d="M54 46 q5 -7 0 -13" stroke={INK} strokeWidth="2.2" strokeLinecap="round" fill="none" />
          <path d="M106 46 q-5 -7 0 -13" stroke={INK} strokeWidth="2.2" strokeLinecap="round" fill="none" />
        </>
      );
    case "healthy_portfolio":
      return (
        <>
          <path
            d="M62 48 L70 60 L80 44 L90 60 L98 48 L95 64 L65 64 Z"
            fill={GOLD}
            stroke={INK}
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          <Coin x={34} y={116} r={8} />
          <Coin x={34} y={104} r={8} />
          <Coin x={126} y={116} r={8} />
        </>
      );
    case "buying_memecoins":
      // Phone in hand, tongue out, coins escaping upward.
      return (
        <>
          <rect x="104" y="96" width="22" height="34" rx="4" fill={SKY} stroke={INK} strokeWidth="2.4" />
          <path d="M108 104 h14 M108 110 h14 M108 116 h9" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M78 126 q4 8 8 0" fill={BLUSH} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
          <Coin x={40} y={44} r={6} />
          <Coin x={58} y={32} r={5} />
        </>
      );
    case "perps_leverage":
      return (
        <>
          <path
            d="M56 52 L80 32 L104 52 L98 60 L62 60 Z"
            fill="var(--panel-grid)"
            stroke={INK}
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          <path d="M80 32 v-8" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="80" cy="22" r="3" fill={BLUSH} stroke={INK} strokeWidth="1.8" />
        </>
      );
    case "gambling":
      // A fan of cards, and a bead of sweat.
      return (
        <>
          <g transform="rotate(-18 112 108)">
            <rect x="104" y="96" width="17" height="25" rx="3" fill={BODY} stroke={INK} strokeWidth="2.2" />
          </g>
          <g transform="rotate(-2 116 106)">
            <rect x="110" y="94" width="17" height="25" rx="3" fill={BODY} stroke={INK} strokeWidth="2.2" />
          </g>
          <path d="M118 100 l4 5 l-4 5 l-4 -5 z" fill={BLUSH} stroke={INK} strokeWidth="1.4" />
          <path d="M52 74 q-4 7 0 9 q4 -2 0 -9" fill={SKY} stroke={INK} strokeWidth="1.8" />
        </>
      );
    case "raiding_savings":
      // A cracked jar with coins spilling out of it.
      return (
        <>
          <path
            d="M24 104 h30 v24 a4 4 0 0 1 -4 4 h-22 a4 4 0 0 1 -4 -4 z"
            fill={BODY}
            stroke={INK}
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          <path d="M22 100 h34" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M39 104 l-5 10 l7 4 l-4 10" stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
          <Coin x={60} y={128} r={6} />
          <Coin x={72} y={134} r={5} />
        </>
      );
    case "empty_wallet":
      // Nothing. Three specks of dust, and that is the joke.
      return (
        <>
          <circle cx="40" cy="60" r="2" fill={INK} opacity="0.5" />
          <circle cx="120" cy="52" r="2.4" fill={INK} opacity="0.5" />
          <circle cx="128" cy="78" r="1.8" fill={INK} opacity="0.5" />
        </>
      );
    default:
      return null;
  }
}
