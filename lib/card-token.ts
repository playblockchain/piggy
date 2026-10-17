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
