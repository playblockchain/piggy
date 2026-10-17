import type { Metadata } from "next";
import { CardView, cardStyles as styles } from "@/app/card-view";
import { decodeCard } from "@/lib/card-token";

export const metadata: Metadata = {
  title: "Lil Piggy",
  description: "A money personality card, read from a wallet snapshot.",
};

/** The card is built entirely from its own URL, so it renders per request. */
export const instant = false;

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

  return (
    <main className={styles.page}>
      <CardView card={card} />
      <p className={styles.tagline}>little pig, big feelings</p>
    </main>
  );
}
