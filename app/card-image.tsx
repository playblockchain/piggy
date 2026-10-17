import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { CardPayload } from "@/lib/card-token";
import { composition } from "@/lib/composition";

/**
 * The card's preview image, shared by both the short and long card routes so
 * a preview can never drift from the card it previews.
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

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/**
 * The pig, read off disk and inlined as a data URI — the renderer cannot be
 * relied on to fetch its own origin. Scenario art wins over mood art, same as
 * the page, so a perps card shows the toppling coin tower.
 */
function piggyDataUri(mood?: string, scenario?: string): string | null {
  const names = [scenario, mood].filter((n): n is string => Boolean(n) && n !== "unknown");
  for (const name of names) {
    for (const ext of [".jpg", ".png", ".webp"]) {
      const file = path.join(process.cwd(), "public", "piggy", `${name}${ext}`);
      try {
        if (!fs.existsSync(file)) continue;
        const mime = ext === ".jpg" ? "image/jpeg" : ext === ".png" ? "image/png" : "image/webp";
        return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function renderCardImage(card: CardPayload | null): ImageResponse {
  const bar = card ? (MOOD_BAR[card.mood.mood] ?? "#DFFFB6") : "#C1DAF9";
  const persona = card?.persona.name ?? "Card not found";
  const mood = card ? `Piggy is ${card.mood.mood}` : "";
  const because = card?.mood.because ?? "Ask your agent for a fresh card.";
  const piggy = card ? piggyDataUri(card.mood.mood, card.scenario) : null;
  // Same slices as the page, so the preview never contradicts the card.
  const slices = card ? composition(card.stats) : [];

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
            boxShadow: "-10px 8px 0 #FDC7D6",
          }}
        >
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

          <div style={{ flex: 1, display: "flex", padding: "32px 44px", alignItems: "center", gap: 32 }}>
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ fontSize: 22, letterSpacing: 3, color: TEXT, marginBottom: 10 }}>
                MONEY PERSONALITY
              </div>
              <div style={{ fontSize: 64, fontWeight: 700, color: TEXT, lineHeight: 1.05 }}>{persona}</div>
              {mood && (
                <div
                  style={{
                    marginTop: 18,
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
              <div style={{ marginTop: 18, fontSize: 25, color: TEXT, lineHeight: 1.35, maxWidth: 470 }}>
                {because}
              </div>
              {/* The bet belongs on the thing people share, not only on the page. */}
              {typeof card?.exposureUsd === "number" && card.exposureUsd > 0 && (
                <div
                  style={{
                    marginTop: 16,
                    alignSelf: "flex-start",
                    padding: "8px 18px",
                    borderRadius: 12,
                    border: `4px solid ${INK}`,
                    background: "#FFE5A0",
                    fontSize: 23,
                    color: TEXT,
                  }}
                >
                  ${Math.round(card.exposureUsd).toLocaleString()} riding on open positions
                </div>
              )}
            </div>

            {piggy && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={piggy} width={230} height={230} alt="" style={{ borderRadius: 18 }} />
            )}

            {slices.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 18, width: 190 }}>
                {slices.map((s) => (
                  <div key={s.label} style={{ display: "flex", flexDirection: "column" }}>
                    <div style={{ fontSize: 44, fontWeight: 700, color: TEXT }}>{pct(s.share)}</div>
                    <div style={{ fontSize: 20, letterSpacing: 2, color: TEXT, textTransform: "uppercase" }}>
                      {s.label}
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
