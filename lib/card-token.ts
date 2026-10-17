import type { AnalyzeResponse } from "./types";

/**
 * The card is stateless: everything it shows is encoded in its own URL.
 * Piggy stores nothing, which is both the privacy position and the reason
 * there is no database to run.
 */
export interface CardPayload {
  persona: AnalyzeResponse["persona"];
  mood: AnalyzeResponse["mood"];
  stats: {
    stableShare: number | null;
    stakedShare: number | null;
    longTailShare: number | null;
    /**
     * Optional: cards made before majors were shown do not carry it, and
     * `composition()` derives it from the other three for those.
     */
    majorShare?: number | null;
    totalKnown: boolean;
  };
  /**
   * The lead plan step. The card used to show a personality and no way out of
   * it — a 25x position read as "50% in stablecoins" with nothing to do about
   * it. Optional so cards made before this still render.
   */
  firstStep?: { action: string; piggySays: string };
  /**
   * Money at risk in open positions, in USD. Deliberately separate from the
   * shares: it is notional and stake, not a holding, and must never be added
   * to them.
   */
  exposureUsd?: number | null;
  cohort: { status: "ok" | "unavailable"; label?: string; note: string };
  asOf: string;
  /** Optional so links made before bands existed still render. */
  band?: string;
  /** Drives Piggy's props: what you actually did, as opposed to how he feels. */
  scenario?: AnalyzeResponse["scenario"]["scenario"];
}

export function encodeCard(payload: CardPayload): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeCard(token: string): CardPayload | null {
  try {
    const json = Buffer.from(token, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || !parsed.persona || !parsed.mood) return null;
    return parsed as CardPayload;
  } catch {
    return null;
  }
}
