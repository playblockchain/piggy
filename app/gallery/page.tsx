import type { Metadata } from "next";
import { CardView } from "@/app/card-view";
import type { CardPayload } from "@/lib/card-token";
import styles from "./gallery.module.css";

/**
 * Every state a card can be in, rendered with the real component.
 *
 * Anyone can call Piggy — there is no filtering who shows up — so every wallet
 * that can arrive needs a card that makes sense. This page is how we check that
 * nothing falls through, and how the size bands get decided by looking at them.
 *
 * These are illustrative inputs for design review, not measured findings. The
 * cohort block is "Not available" on all of them, because it genuinely is.
 */

export const metadata: Metadata = {
  title: "Lil Piggy · every card",
  description: "Every scenario a card can be in, rendered with the real component.",
};

const asOf = "2026-10-17T00:00:00.000Z";
const noCohort = {
  status: "unavailable" as const,
  note: "No cohort data has been measured yet, so I cannot tell you what wallets like yours did. I would rather say that than make it up.",
};

interface Entry {
  title: string;
  when: string;
  card: CardPayload;
}

const ENTRIES: Entry[] = [
  {
    title: "Empty wallet",
    when: "Nothing in the wallet at all. The onboarding case — it must not read as an error.",
    card: {
      persona: {
        id: "clean-slate",
        name: "Clean Slate",
        because: "Nothing in here yet. No history to hold against you, which is almost romantic.",
      },
      mood: {
        mood: "curious",
        because: "Empty. No crimes, no triumphs. Put something in and let me judge you properly.",
      },
      stats: { stableShare: null, stakedShare: null, longTailShare: null, totalKnown: false },
      cohort: noCohort,
      asOf,
      band: "empty",
      scenario: "empty_wallet"
    },
  },
  {
    title: "Dust only",
    when: "Under $25. Real, but too small for any plan to be worth fees.",
    card: {
      persona: {
        id: "stable-queen",
        name: "Pocket Lint",
        because: "There is money here, technically, in the way a crumb is technically cake.",
      },
      mood: { mood: "curious", because: "I want to help but there is nothing to work with yet." },
      stats: { stableShare: 0.78, stakedShare: 0, longTailShare: 0.22, totalKnown: true },
      cohort: noCohort,
      asOf,
      band: "dust",
      scenario: "unknown"
    },
  },
  {
    title: "No prices supplied",
    when: "Caller sent balances without USD values. Shares are genuinely uncomputable.",
    card: {
      persona: {
        id: "unreadable",
        name: "Unreadable (for now)",
        because: "No USD prices were supplied, so I cannot weigh what you hold.",
      },
      mood: {
        mood: "curious",
        because: "I cannot see enough to have a feeling and the not-knowing is EATING me.",
      },
      stats: { stableShare: null, stakedShare: null, longTailShare: null, totalKnown: false },
      cohort: noCohort,
      asOf,
      band: "shrimp",
      scenario: "unknown"
    },
  },
  {
    title: "Idle stablecoins",
    when: "Mostly cash, doing nothing. The most common fixable state.",
    card: {
      persona: {
        id: "stable-queen",
        name: "Stable Queen",
        because: "81% of your balance is sitting in stablecoins.",
      },
      mood: { mood: "happy", because: "Most of your money is working. I could cry. I will not. But I could." },
      stats: { stableShare: 0.81, stakedShare: 0.05, longTailShare: 0.14, totalKnown: true },
      cohort: noCohort,
      asOf,
      band: "shrimp",
      scenario: "healthy_portfolio"
    },
  },
  {
    title: "Staking / earning yield",
    when: "A real share staked. Piggy's favourite thing.",
    card: {
      persona: {
        id: "steady-saver",
        name: "Steady Saver",
        because: "Almost everything you hold is staked or in stables.",
      },
      mood: {
        mood: "proud",
        because: "Almost every coin working, nothing silly. This is the most attractive thing I have seen.",
      },
      stats: { stableShare: 0.34, stakedShare: 0.61, longTailShare: 0.05, totalKnown: true },
      cohort: noCohort,
      asOf,
      band: "shrimp",
      scenario: "staking_yield"
    },
  },
  {
    title: "DCA / buying on a rhythm",
    when: "History shows evenly spaced buys over weeks. Needs the history read.",
    card: {
      persona: {
        id: "steady-saver",
        name: "Rhythm Haver",
        because: "You buy on a schedule and it shows.",
      },
      mood: {
        mood: "excited",
        because: "You are buying on a rhythm like a person with a FINANCIAL PLAN. I am obsessed.",
      },
      stats: { stableShare: 0.22, stakedShare: 0.44, longTailShare: 0.12, totalKnown: true },
      cohort: noCohort,
      asOf,
      band: "shrimp",
      scenario: "dca_saving"
    },
  },
  {
    title: "Healthy but mixed",
    when: "Nothing wrong, nothing exemplary. The fence Piggy refuses to sit on.",
    card: {
      persona: { id: "dip-diva", name: "Dip Diva", because: "38% of your balance is in majors." },
      mood: {
        mood: "suspicious",
        because: "This could go either way and we both know which way you are leaning.",
      },
      stats: { stableShare: 0.18, stakedShare: 0.11, longTailShare: 0.33, totalKnown: true },
      cohort: noCohort,
      asOf,
      band: "shrimp",
      scenario: "unknown"
    },
  },
  {
    title: "Buying memecoins",
    when: "Most of the balance in long-tail tokens.",
    card: {
      persona: {
        id: "delulu-degen",
        name: "Delulu Degen",
        because: "61% of your balance is in tokens I do not recognise as majors, stables or staked assets.",
      },
      mood: { mood: "sad", because: "More than half of this is dog coins, babe. I am lying down about it." },
      stats: { stableShare: 0.12, stakedShare: 0.27, longTailShare: 0.61, totalKnown: true },
      cohort: noCohort,
      asOf,
      band: "shrimp",
      scenario: "buying_memecoins"
    },
  },
  {
    title: "Raiding savings",
    when: "History shows stables or staked assets repeatedly leaving. Needs the history read.",
    card: {
      persona: {
        id: "delulu-degen",
        name: "Jar Raider",
        because: "Money keeps leaving the places you put it for safekeeping.",
      },
      mood: { mood: "sad", because: "You keep going back into your own savings. I saw. I write everything down." },
      stats: { stableShare: 0.09, stakedShare: 0.14, longTailShare: 0.44, totalKnown: true },
      cohort: noCohort,
      asOf,
      band: "shrimp",
      scenario: "raiding_savings"
    },
  },
  {
    title: "Perps / leverage",
    when: "Open perps positions, supplied by a plugin.",
    card: {
      persona: {
        id: "shrimp-gambler",
        name: "Shrimp Gambler",
        because: "Small balance, irregular income you told me about, and open positions on gambling venues.",
      },
      mood: {
        mood: "unhinged",
        because: "Nearly everything you own is one bet. One. I have aged years reading this.",
      },
      stats: { stableShare: 0.02, stakedShare: 0, longTailShare: 0.95, totalKnown: true },
      cohort: noCohort,
      asOf,
      band: "shrimp",
      scenario: "perps_leverage"
    },
  },
  {
    title: "Whale",
    when: "Over $250k. Not the audience, but anyone can call — a plan must still make sense.",
    card: {
      persona: {
        id: "steady-saver",
        name: "Steady Saver",
        because: "Spread across majors, staked assets and stables.",
      },
      mood: {
        mood: "proud",
        because: "Almost every coin working, nothing silly. This is the most attractive thing I have seen.",
      },
      stats: { stableShare: 0.3, stakedShare: 0.45, longTailShare: 0.08, totalKnown: true },
      cohort: noCohort,
      asOf,
      band: "whale",
      scenario: "healthy_portfolio"
    },
  },
  {
    title: "Broken card link",
    when: "Link truncated or edited. Must fail clearly and say nothing is stored.",
    card: {
      persona: {
        id: "unreadable",
        name: "Card not readable",
        because: "This link is incomplete or was changed after it was made.",
      },
      mood: { mood: "curious", because: "Ask your agent for a fresh card — I keep nothing." },
      stats: { stableShare: null, stakedShare: null, longTailShare: null, totalKnown: false },
      cohort: noCohort,
      asOf,
      band: "shrimp",
      scenario: "unknown"
    },
  },
];

export default function Gallery() {
  return (
    <main className={styles.wrap}>
      <div className={styles.topStrip}>
        <span className={styles.wordmark}>lil piggy · every card</span>
      </div>

      <div className={styles.intro}>
        <h1 className={styles.introTitle}>Every state a card can be in</h1>
        <p className={styles.introBody}>
          Anyone can call Lil Piggy, so every wallet that can arrive needs a card that makes sense —
          including empty ones, dust, unpriced balances and whales. These are illustrative inputs
          for design review, rendered with the real card component. The cohort block reads &ldquo;not
          available&rdquo; on every one of them because it genuinely is.
        </p>
      </div>

      <div className={styles.grid}>
        {ENTRIES.map((entry) => (
          <div className={styles.item} key={entry.title}>
            <div className={styles.caption}>
              <div className={styles.captionTitle}>{entry.title}</div>
              <p className={styles.captionWhen}>{entry.when}</p>
            </div>
            <CardView card={entry.card} />
          </div>
        ))}
      </div>
    </main>
  );
}
