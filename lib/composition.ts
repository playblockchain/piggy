/**
 * What the card should actually show about a wallet's make-up.
 *
 * The card had three fixed slots: stablecoins, staked, long-tail. A wallet
 * holding nothing but ETH scores zero in all three, so the card read
 * "0% · 0% · 0%" about a wallet that was 100% one asset. Every number was
 * correct and the picture was useless — majors were computed all along and
 * then never displayed.
 *
 * The slices are now chosen by what is in the wallet. Anything rounding to 0%
 * is dropped rather than printed, because an empty slot says nothing and three
 * of them look like a broken product.
 */

export interface Slice {
  label: string;
  share: number;
}

export interface ShareInput {
  stableShare: number | null;
  stakedShare: number | null;
  longTailShare: number | null;
  /** Optional: cards made before majors were shown do not carry it. */
  majorShare?: number | null;
}

const known = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export function composition(stats: ShareInput): Slice[] {
  const stable = known(stats.stableShare);
  const staked = known(stats.stakedShare);
  const longTail = known(stats.longTailShare);

  // Nothing priced, or an empty wallet: there is no split to show, and the
  // card says so in words instead of printing zeros.
  if (stable === null && staked === null && longTail === null) return [];

  // The four buckets are exhaustive and mutually exclusive — long-tail is
  // defined as "not stable, not staked, not major" — so majors is whatever the
  // other three leave over. Derived rather than required, which means cards
  // issued before this change still render with a correct majors slice.
  const major =
    known(stats.majorShare) ?? Math.max(0, 1 - (stable ?? 0) - (staked ?? 0) - (longTail ?? 0));

  return [
    { label: "in stablecoins", share: stable ?? 0 },
    { label: "staked", share: staked ?? 0 },
    { label: "in majors", share: major },
    { label: "long-tail", share: longTail ?? 0 },
  ]
    .filter((s) => Math.round(s.share * 100) > 0)
    .sort((a, b) => b.share - a.share)
    .slice(0, 3);
}
