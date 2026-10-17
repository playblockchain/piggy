import { head, put } from "@vercel/blob";
import type { CardPayload } from "./card-token";

/**
 * Short card links.
 *
 * The first design encoded the whole card into the URL so nothing had to be
 * stored. It worked, and it was unusable: a 700-character link that cannot be
 * read aloud, pasted in a bio, or sent to a friend without looking broken. For
 * a product whose output is a shareable card, that was the wrong trade.
 *
 * Cards now live in blob storage behind a short id. The long form still works
 * so no link ever dies, and without a storage token Piggy falls back to it
 * rather than failing.
 *
 * What is stored is only what the card shows: a persona, a mood, three shares,
 * a cohort note. No addresses, no balances, nothing that identifies a wallet.
 */

const ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";

function makeId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function cardStoreAvailable(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** Returns the short id, or null when storage is unavailable or fails. */
export async function saveCard(payload: CardPayload): Promise<string | null> {
  if (!cardStoreAvailable()) return null;
  const id = makeId();
  try {
    await put(`cards/${id}.json`, JSON.stringify(payload), {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/json",
      // A card is immutable once made, so it can be cached hard.
      cacheControlMaxAge: 31_536_000,
    });

    // Confirm it reads back before handing out a short link. A write that
    // succeeds but cannot be read would produce a link that 404s — strictly
    // worse than the long link it replaced.
    const readBack = await loadCard(id);
    return readBack ? id : null;
  } catch {
    // Storage trouble must never cost someone their card — the caller falls
    // back to the long self-contained link.
    return null;
  }
}

export async function loadCard(id: string): Promise<CardPayload | null> {
  if (!/^[a-z2-9]{6,24}$/.test(id)) return null;
  try {
    const meta = await head(`cards/${id}.json`);
    const res = await fetch(meta.url, { cache: "force-cache" });
    if (!res.ok) return null;
    const parsed = (await res.json()) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const card = parsed as CardPayload;
    return card.persona && card.mood ? card : null;
  } catch {
    return null;
  }
}
