import { ImageResponse } from "next/og";
import { decodeCard } from "@/lib/card-token";

/**
 * The card's preview image.
 *
 * Without this, sharing a card link gets you a bare URL — no picture in a
 * chat, on X, or in an agent's reply. The card is the shareable artefact, so
 * the link has to carry a picture of itself.
 *
 * Rendered per request from the same token the page uses, so the preview can
 * never show something different from the card itself.
 */

export const alt = "A Lil Piggy money personality card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MOOD_BAR: Record<string, string> = {
  happy: "#DFFFB6",
  excited: "#DFFFB6",
  proud: "#DFFFB6",
  curious: "#C1DAF9",
  suspicious: "#FFD59E",
  sad: "#F9C3DD",
  unhinged: "#F9C3DD",
};

const INK = "#A76E80";
const TEXT = "#6C4550";

function pct(v: number | null): string {
  return v === null || Number.isNaN(v) ? "—" : `${Math.round(v * 100)}%`;
}

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const card = decodeCard(token);

  const bar = card ? (MOOD_BAR[card.mood.mood] ?? "#DFFFB6") : "#C1DAF9";
  const persona = card?.persona.name ?? "Card not readable";
  const mood = card ? `Piggy is ${card.mood.mood}` : "";
  const because = card?.mood.because ?? "Ask your agent for a fresh card.";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#FAE1EA",
          padding: 48,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            background: "#FFFFFF",
            border: `6px solid ${INK}`,
            borderRadius: 20,
            overflow: "hidden",
            boxShadow: `-10px 8px 0 #FDC7D6`,
          }}
        >
          {/* title bar */}
          <div
            style={{
              height: 72,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 28px",
              background: bar,
              borderBottom: `5px solid ${INK}`,
            }}
          >
            <div style={{ fontSize: 28, letterSpacing: 2, color: TEXT }}>PIGGY.EXE</div>
            <div style={{ display: "flex", gap: 12 }}>
              {["#FFE5A0", "#BBEC82", "#FEB4C9"].map((c) => (
                <div
                  key={c}
                  style={{ width: 24, height: 24, borderRadius: 12, background: c, border: `4px solid ${INK}` }}
                />
              ))}
            </div>
          </div>

          <div style={{ flex: 1, display: "flex", padding: "36px 44px", alignItems: "center", gap: 40 }}>
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ fontSize: 22, letterSpacing: 3, color: TEXT, marginBottom: 10 }}>
                MONEY PERSONALITY
              </div>
              <div style={{ fontSize: 76, fontWeight: 700, color: TEXT, lineHeight: 1.05 }}>{persona}</div>
              {mood && (
                <div
                  style={{
                    marginTop: 20,
                    alignSelf: "flex-start",
                    padding: "10px 22px",
                    borderRadius: 999,
                    border: `4px solid ${INK}`,
                    background: bar,
                    fontSize: 24,
                    letterSpacing: 2,
                    color: TEXT,
                    textTransform: "uppercase",
                  }}
                >
                  {mood}
                </div>
              )}
              <div style={{ marginTop: 20, fontSize: 28, color: TEXT, lineHeight: 1.35, maxWidth: 620 }}>
                {because}
              </div>
            </div>

            {card && (
              <div style={{ display: "flex", flexDirection: "column", gap: 18, width: 220 }}>
                {[
                  ["in stablecoins", card.stats.stableShare],
                  ["staked", card.stats.stakedShare],
                  ["long-tail", card.stats.longTailShare],
                ].map(([label, value]) => (
                  <div key={label as string} style={{ display: "flex", flexDirection: "column" }}>
                    <div style={{ fontSize: 52, fontWeight: 700, color: TEXT }}>{pct(value as number | null)}</div>
                    <div style={{ fontSize: 20, letterSpacing: 2, color: TEXT, textTransform: "uppercase" }}>
                      {label as string}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              padding: "0 44px 28px",
              fontSize: 22,
              letterSpacing: 2,
              color: TEXT,
              textTransform: "uppercase",
            }}
          >
            lil piggy · little pig, big feelings
          </div>
        </div>
      </div>
    ),
    size,
  );
}
