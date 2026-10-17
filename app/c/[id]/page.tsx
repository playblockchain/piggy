import type { Metadata } from "next";
import { CardView, cardStyles as styles } from "@/app/card-view";
import { loadCard } from "@/lib/card-store";

/** The short card link. Same view as the long one, just a readable URL. */

export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const card = await loadCard((await params).id);
  if (!card) return { title: "Lil Piggy", description: "This card could not be found." };
  return { title: `${card.persona.name} · Lil Piggy`, description: card.mood.because };
}

export default async function ShortCardPage({ params }: { params: Promise<{ id: string }> }) {
  const card = await loadCard((await params).id);

  if (!card) {
    return (
      <main className={styles.page}>
        <div className={styles.errorFrame}>
          <div className={styles.errorInner}>
            <h1 className={styles.errorTitle}>Card not found</h1>
            <p className={styles.note}>
              This card has expired or the link is wrong. Ask your agent for a fresh one.
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
