import type { Metadata } from "next";
import { decodeCard } from "@/lib/card-token";
import { Piggy } from "@/app/piggy";
import type { Mood } from "@/lib/types";
import styles from "./card.module.css";

const MOOD_TOKEN: Record<Mood, string> = {
  proud: "var(--proud)",
  okay: "var(--okay)",
  sad: "var(--sad)",
  unhinged: "var(--unhinged)",
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
        <div className={styles.statValueUnknown}>Not available</div>
      )}
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

export default async function CardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const card = decodeCard(token);

  if (!card) {
    return (
      <main className={styles.page}>
        <div className={styles.errorCard}>
          <h1 className={styles.errorTitle}>This card link is not readable</h1>
          <p className={styles.note}>
            The link is incomplete or was changed after it was created. Ask your agent for a fresh
            card — Piggy stores nothing, so there is no saved copy to recover.
          </p>
        </div>
      </main>
    );
  }

  const { persona, mood, stats, cohort, asOf } = card;
  const dated = new Date(asOf);
  const datedLabel = Number.isNaN(dated.getTime())
    ? "date unknown"
    : dated.toISOString().slice(0, 10);

  return (
    <main className={styles.page}>
      <article className={styles.card}>
        <header className={styles.hero}>
          <Piggy mood={mood.mood} />
          <p className={styles.eyebrow}>Money personality</p>
          <h1 className={styles.persona}>{persona.name}</h1>
          <p className={styles.because}>{persona.because}</p>
          <p className={styles.moodRow}>
            <span className={styles.moodDot} style={{ background: MOOD_TOKEN[mood.mood] }} aria-hidden="true" />
            <span>
              Piggy is {mood.mood} — {mood.because}
            </span>
          </p>
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>What you hold, {datedLabel}</h2>
          <div className={styles.stats}>
            <Stat label="in stablecoins" share={stats.stableShare} />
            <Stat label="staked" share={stats.stakedShare} />
            <Stat label="in long-tail tokens" share={stats.longTailShare} />
          </div>
          {!stats.totalKnown && (
            <p className={styles.note} style={{ marginTop: 12 }}>
              No USD prices were supplied with this snapshot, so shares could not be calculated.
            </p>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Wallets like yours</h2>
          <span className={styles.badge}>
            {cohort.status === "ok" ? `Measured · ${cohort.label ?? "cohort"}` : "Not available"}
          </span>
          <p className={styles.note}>{cohort.note}</p>
        </section>

        <footer className={styles.footer}>
          Piggy is education, not financial advice. This is a snapshot of holdings, not a record of
          what you did or a forecast of what you will get. Everything shown here is encoded in this
          link itself — Piggy keeps nothing.
        </footer>
      </article>

      <p className={styles.tagline}>Lil Piggy — we make wealth management easy</p>
    </main>
  );
}
