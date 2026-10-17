import type { Metadata } from "next";
import { decodeCard } from "@/lib/card-token";
import { Piggy } from "@/app/piggy";
import type { Mood } from "@/lib/types";
import styles from "./card.module.css";

/**
 * Mood maps onto the system's title-bar semantics: green is fine, peach is a
 * warning, pink is trouble, blue is "I do not know yet".
 */
const MOOD_BAR: Record<Mood, { bar: string; chip: string }> = {
  happy: { bar: "windowBar--green", chip: styles["moodChip--green"] },
  excited: { bar: "windowBar--green", chip: styles["moodChip--green"] },
  proud: { bar: "windowBar--green", chip: styles["moodChip--green"] },
  curious: { bar: "windowBar--blue", chip: styles["moodChip--blue"] },
  suspicious: { bar: "windowBar--peach", chip: styles["moodChip--peach"] },
  sad: { bar: "windowBar--pink", chip: styles["moodChip--pink"] },
  unhinged: { bar: "windowBar--pink", chip: styles["moodChip--pink"] },
};

export const metadata: Metadata = {
  title: "Lil Piggy",
  description: "A money personality card, read from a wallet snapshot.",
};

/** The card is built entirely from its own URL, so it renders per request. */
export const instant = false;

function pct(share: number | null): string | null {
  if (share === null || Number.isNaN(share)) return null;
  return `${Math.round(share * 100)}%`;
}

function Stat({ label, share }: { label: string; share: number | null }) {
  const formatted = pct(share);
  return (
    <div className={styles.stat}>
      {formatted ? (
        <div className={styles.statValue}>{formatted}</div>
      ) : (
        <span className={styles.statValueUnknown}>Not available</span>
      )}
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

function Dots() {
  return (
    <span className="dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export default async function CardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const card = decodeCard(token);

  if (!card) {
    return (
      <main className={styles.page}>
        <div className={styles.errorFrame}>
          <div className={styles.errorInner}>
            <h1 className={styles.errorTitle}>Card not readable</h1>
            <p className={styles.note}>
              This link is incomplete or was changed after it was made. Ask your agent for a fresh
              card — Lil Piggy stores nothing, so there is no saved copy to recover.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const { persona, mood, stats, cohort, asOf } = card;
  const dated = new Date(asOf);
  const datedLabel = Number.isNaN(dated.getTime())
    ? "date unknown"
    : dated.toISOString().slice(0, 10);
  const tone = MOOD_BAR[mood.mood];

  return (
    <main className={styles.page}>
      <article className={`window ${styles.card}`}>
        <div className={`windowBar ${tone.bar}`}>
          <span>piggy.exe</span>
          <Dots />
        </div>

        <header className={styles.hero}>
          <Piggy mood={mood.mood} size={132} />
          <p className={styles.eyebrow}>Money personality</p>
          <h1 className={styles.persona}>{persona.name}</h1>
          <p className={styles.because}>{persona.because}</p>
          <p className={`${styles.moodChip} ${tone.chip}`}>Piggy is {mood.mood}</p>
          <p className={styles.moodWhy}>{mood.because}</p>
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>What you hold · {datedLabel}</h2>
          <div className={styles.stats}>
            <Stat label="in stablecoins" share={stats.stableShare} />
            <Stat label="staked" share={stats.stakedShare} />
            <Stat label="long-tail" share={stats.longTailShare} />
          </div>
          {!stats.totalKnown && (
            <p className={styles.note} style={{ marginTop: "var(--space-3)" }}>
              No USD prices came with this snapshot, so shares could not be worked out.
            </p>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Wallets like yours</h2>
          <span className={`${styles.badge} ${cohort.status === "ok" ? styles["badge--ok"] : ""}`}>
            {cohort.status === "ok" ? `Measured · ${cohort.label ?? "cohort"}` : "Not available"}
          </span>
          <p className={styles.note}>{cohort.note}</p>
        </section>

        <footer className={styles.footer}>
          Lil Piggy is education, not financial advice. This is a snapshot of holdings, not a record
          of what you did or a forecast of what you will get. Everything here is encoded in this link
          itself — Lil Piggy keeps nothing.
        </footer>
      </article>

      <p className={styles.tagline}>little pig, big feelings</p>
    </main>
  );
}
