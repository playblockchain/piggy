import { Piggy } from "@/app/piggy";
import type { CardPayload } from "@/lib/card-token";
import type { Mood } from "@/lib/types";
import styles from "./card-view.module.css";

/**
 * The card. Shared by the real route and the gallery, so what the gallery
 * shows is what a user gets — never a mock that drifts from the real thing.
 */

/** Mood maps onto the system's title-bar semantics. */
const MOOD_BAR: Record<Mood, { bar: string; chip: string }> = {
  happy: { bar: "windowBar--green", chip: styles["moodChip--green"] },
  excited: { bar: "windowBar--green", chip: styles["moodChip--green"] },
  proud: { bar: "windowBar--green", chip: styles["moodChip--green"] },
  curious: { bar: "windowBar--blue", chip: styles["moodChip--blue"] },
  suspicious: { bar: "windowBar--peach", chip: styles["moodChip--peach"] },
  sad: { bar: "windowBar--pink", chip: styles["moodChip--pink"] },
  unhinged: { bar: "windowBar--pink", chip: styles["moodChip--pink"] },
};

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

export function CardView({ card }: { card: CardPayload }) {
  const { persona, mood, stats, cohort, asOf, band, scenario } = card;
  const dated = new Date(asOf);
  const datedLabel = Number.isNaN(dated.getTime())
    ? "date unknown"
    : dated.toISOString().slice(0, 10);
  const tone = MOOD_BAR[mood.mood];

  return (
    <article className={`window ${styles.card}`}>
      <div className={`windowBar ${tone.bar}`}>
        <span>piggy.exe</span>
        <Dots />
      </div>

      <header className={styles.hero}>
        <Piggy mood={mood.mood} scenario={scenario} size={132} />
        <p className={styles.eyebrow}>Money personality</p>
        <h1 className={styles.persona}>{persona.name}</h1>
        <p className={styles.because}>{persona.because}</p>
        <p className={`${styles.moodChip} ${tone.chip}`}>Piggy is {mood.mood}</p>
        <p className={styles.moodWhy}>{mood.because}</p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          What you hold · {datedLabel}
          {band ? ` · ${band}` : ""}
        </h2>
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
  );
}

export { styles as cardStyles };
