/**
 * Transaction history.
 *
 * PayBox returns balances only, so anything about *behaviour over time* has to
 * come from an indexer, read from the address PayBox hands over. Everything
 * onchain is public, so no extra permission is involved — but it is a bigger
 * read than "check my balances", which is why it is opt-in via an API key and
 * why Piggy stores none of it.
 *
 * Provider: Helius Enhanced Transactions. It is a legacy endpoint in
 * maintenance mode but still works and only needs a key; Parsed Events is its
 * successor. Everything provider-shaped is confined to fetchHistory, so
 * swapping it later touches one function.
 *
 * Why not plain RPC, which needs no key at all? It works — measured against
 * mainnet on 17 Oct 2026:
 *
 *   - getTokenAccountsByOwner finds the wallet's token account. This step is
 *     essential: inbound SPL transfers touch the TOKEN ACCOUNT, not the owner
 *     address, so getSignaturesForAddress on the wallet silently misses them.
 *   - getTransaction with jsonParsed and maxSupportedTransactionVersion: 1
 *     returns pre/postTokenBalances, and the per-owner delta between them is
 *     the transfer. Verified against a real transfer: -49.986741 out,
 *     +49.986741 in, both correct.
 *
 * It is not the default because of throughput, not capability: the public RPC
 * needs one getTransaction per signature, which measured ~1.8s each — about
 * three minutes for 100 transactions. That is far too slow for an endpoint
 * someone just paid for. A key buys throughput, not access.
 */

export type HistoryStatus =
  | "ok"
  | "no_key"
  | "fetch_failed"
  | "rate_limited"
  | "unauthorized"
  | "empty";

/** The subset of Helius's response Piggy relies on. Everything else ignored. */
export interface ParsedTx {
  type?: string;
  source?: string;
  timestamp?: number;
  signature?: string;
  nativeTransfers?: Array<{
    fromUserAccount?: string;
    toUserAccount?: string;
    amount?: number;
  }>;
  tokenTransfers?: Array<{
    fromUserAccount?: string;
    toUserAccount?: string;
    mint?: string;
    tokenAmount?: number;
  }>;
}

export interface HistoryResult {
  status: HistoryStatus;
  transactions: ParsedTx[];
  /** Specific, actionable message when status is not "ok". */
  message?: string;
}

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const STABLE_MINTS = new Set([USDC_MINT]);
const STAKED_MINTS = new Set<string>([
  // Liquid-staking mints. Add more as needed; an unknown mint is simply not
  // counted as savings, which is the safe direction to be wrong in.
  "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", // jitoSOL
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", // mSOL
]);

export async function fetchHistory(address: string, limit = 100): Promise<HistoryResult> {
  const key = process.env.HELIUS_API_KEY;
  if (!key) {
    return {
      status: "no_key",
      transactions: [],
      message:
        "No HELIUS_API_KEY is configured, so I cannot read transaction history. Set one to unlock habits over time.",
    };
  }

  const url = `https://api.helius.xyz/v0/addresses/${encodeURIComponent(
    address,
  )}/transactions?api-key=${encodeURIComponent(key)}&limit=${limit}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: "application/json" } });
  } catch {
    return {
      status: "fetch_failed",
      transactions: [],
      message: "Could not reach the history provider. Habits over time are unavailable right now.",
    };
  }

  if (res.status === 401 || res.status === 403) {
    return {
      status: "unauthorized",
      transactions: [],
      message: "The history provider rejected the API key. Check HELIUS_API_KEY.",
    };
  }
  if (res.status === 429) {
    return {
      status: "rate_limited",
      transactions: [],
      message: "The history provider is rate limiting this key. Habits over time are unavailable.",
    };
  }
  if (!res.ok) {
    return {
      status: "fetch_failed",
      transactions: [],
      message: `The history provider returned ${res.status}. Habits over time are unavailable.`,
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      status: "fetch_failed",
      transactions: [],
      message: "The history provider returned a response I could not read.",
    };
  }

  if (!Array.isArray(body)) {
    return {
      status: "fetch_failed",
      transactions: [],
      message: "The history provider returned an unexpected shape.",
    };
  }
  if (body.length === 0) {
    return {
      status: "empty",
      transactions: [],
      message: "This address has no transaction history I can see.",
    };
  }
  return { status: "ok", transactions: body as ParsedTx[] };
}

export interface HabitReading {
  /** How money arrives — the thing cohorts are matched on. */
  funding: {
    depositCount: number;
    medianDepositUsdc: number | null;
    regularity: "regular" | "irregular" | "unknown";
    /** Exactly what was counted, so the claim can be checked. */
    measured: string;
  };
  dca: { detected: boolean; measured: string };
  raidingSavings: { detected: boolean; measured: string };
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

function stddev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
}

const DAY = 86400;

/**
 * Pure: derives habits from parsed transactions. No network, no clock — so it
 * can be tested against a fixture, which matters because the live provider
 * response cannot be verified without a key.
 *
 * Every reading reports what it actually measured rather than asserting a
 * habit outright. "Five swaps spread evenly over six weeks" is defensible;
 * "you DCA" is a story about someone's intent.
 */
export function deriveHabits(address: string, txs: ParsedTx[]): HabitReading {
  const inbound = txs
    .filter((t) =>
      (t.tokenTransfers ?? []).some(
        (tt) =>
          tt.toUserAccount === address &&
          tt.fromUserAccount !== address &&
          tt.mint === USDC_MINT &&
          typeof tt.tokenAmount === "number" &&
          tt.tokenAmount > 0,
      ),
    )
    .map((t) => ({
      timestamp: t.timestamp ?? 0,
      amount: (t.tokenTransfers ?? [])
        .filter((tt) => tt.toUserAccount === address && tt.mint === USDC_MINT)
        .reduce((sum, tt) => sum + (tt.tokenAmount ?? 0), 0),
    }))
    .filter((d) => d.timestamp > 0)
    .sort((a, b) => a.timestamp - b.timestamp);

  const gapsDays = inbound
    .slice(1)
    .map((d, i) => (d.timestamp - inbound[i].timestamp) / DAY);
  const gapSpread = stddev(gapsDays);

  let regularity: HabitReading["funding"]["regularity"] = "unknown";
  if (inbound.length >= 3 && gapSpread !== null) {
    regularity = gapSpread <= 10 ? "regular" : "irregular";
  }

  // DCA: swaps spread evenly over time. Measured on cadence, not on intent.
  const swaps = txs
    .filter((t) => t.type === "SWAP" && (t.timestamp ?? 0) > 0)
    .map((t) => t.timestamp as number)
    .sort((a, b) => a - b);
  const swapGaps = swaps.slice(1).map((t, i) => (t - swaps[i]) / DAY);
  const swapSpread = stddev(swapGaps);
  const swapSpanWeeks = swaps.length >= 2 ? (swaps[swaps.length - 1] - swaps[0]) / (DAY * 7) : 0;
  const dcaDetected = swaps.length >= 3 && swapSpanWeeks >= 3 && swapSpread !== null && swapSpread <= 7;

  // Raiding savings: stablecoins or staked assets leaving the wallet.
  const raids = txs.filter((t) =>
    (t.tokenTransfers ?? []).some(
      (tt) =>
        tt.fromUserAccount === address &&
        tt.toUserAccount !== address &&
        typeof tt.mint === "string" &&
        (STABLE_MINTS.has(tt.mint) || STAKED_MINTS.has(tt.mint)) &&
        typeof tt.tokenAmount === "number" &&
        tt.tokenAmount > 0,
    ),
  );

  return {
    funding: {
      depositCount: inbound.length,
      medianDepositUsdc: median(inbound.map((d) => d.amount)),
      regularity,
      measured:
        inbound.length === 0
          ? "No inbound USDC transfers in the window I can see."
          : `${inbound.length} inbound USDC transfers, median ${
              median(inbound.map((d) => d.amount))?.toFixed(2) ?? "unknown"
            } USDC${
              gapSpread !== null ? `, gaps between them varying by about ${gapSpread.toFixed(0)} days` : ""
            }.`,
    },
    dca: {
      detected: dcaDetected,
      measured:
        swaps.length < 3
          ? `Only ${swaps.length} swaps in the window — not enough to call a rhythm.`
          : `${swaps.length} swaps spread over about ${swapSpanWeeks.toFixed(0)} weeks${
              swapSpread !== null ? `, timing varying by about ${swapSpread.toFixed(0)} days` : ""
            }.`,
    },
    raidingSavings: {
      detected: raids.length >= 2,
      measured:
        raids.length === 0
          ? "No stablecoins or staked assets left the wallet in the window I can see."
          : `${raids.length} occasions where stablecoins or staked assets left the wallet.`,
    },
  };
}
