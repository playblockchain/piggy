import { Piggy } from "@/app/piggy";
import type { CardPayload } from "@/lib/card-token";
import { composition } from "@/lib/composition";
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

function Stat({ label, share }: { label: string; share: number }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statValue}>{Math.round(share * 100)}%</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

/** A filename someone can find again, rather than "opengraph-image.png". */
const slug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "card";

function Dots() {
  return (
    <span className="dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export function CardView({
  card,
  /** The short route stores the card; the long one carries it in the URL. */
  stored = false,
  /** Set on a real card route so the image can be saved. The gallery has none. */
  imageHref,
}: {
  card: CardPayload;
  stored?: boolean;
  imageHref?: string;
}) {
  const { persona, mood, stats, cohort, asOf, band, scenario, firstStep, exposureUsd } = card;
  const slices = composition(stats);
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
        {slices.length > 0 ? (
          <div className={styles.stats}>
            {slices.map((s) => (
              <Stat key={s.label} label={s.label} share={s.share} />
            ))}
          </div>
        ) : (
          <p className={styles.note}>
            {stats.totalKnown
              ? "Nothing priced in here to split, so there is no make-up to report."
              : "No USD prices could be found for this wallet, so shares are unavailable."}
          </p>
        )}
        {typeof exposureUsd === "number" && exposureUsd > 0 && (
          <p className={styles.exposure}>
            <strong>${Math.round(exposureUsd).toLocaleString()}</strong> riding on open positions.
            That is notional and stake, not a holding, so it is not in the shares above.
          </p>
        )}
      </section>

      {firstStep && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Do this first</h2>
          <p className={styles.step}>{firstStep.action}</p>
          <p className={styles.note}>{firstStep.piggySays}</p>
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Wallets like yours</h2>
        <span className={`${styles.badge} ${cohort.status === "ok" ? styles["badge--ok"] : ""}`}>
          {cohort.status === "ok" ? `Measured · ${cohort.label ?? "cohort"}` : "Not available"}
        </span>
        <p className={styles.note}>{cohort.note}</p>
      </section>

      {imageHref && (
        <div className={styles.actions}>
          <a className={styles.action} href={imageHref} download={`lil-piggy-${slug(persona.name)}.png`}>
            Save card as PNG
          </a>
        </div>
      )}

      <footer className={styles.footer}>
        Lil Piggy is education, not financial advice. This is a snapshot of holdings, not a record
        of what you did or a forecast of what you will get.{" "}
        {stored
          ? "This card is saved behind its short link so it can be shared: it holds the verdict you see here and nothing else — no address, no balances."
          : "Everything here is encoded in this link itself — Lil Piggy keeps nothing."}
      </footer>
    </article>
  );
}

export { styles as cardStyles };
