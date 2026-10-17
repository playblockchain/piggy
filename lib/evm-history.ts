/**
 * EVM transaction history, via Alchemy.
 *
 * This is the gap nothing free could fill. Every public Base RPC caps
 * eth_getLogs at 50 or 10,000 blocks, Basescan charges for Base, and
 * Blockscout blocks scripted access — so months of EVM history was simply
 * unreadable. Alchemy's getAssetTransfers returns it in one call per chain,
 * and the free tier is enough for this.
 *
 * Without ALCHEMY_API_KEY, every reading here is reported unavailable with the
 * reason. Nothing is inferred from holdings to fill the gap.
 */

export type EvmChain = "base" | "ethereum" | "polygon";

const HOSTS: Record<EvmChain, string> = {
  base: "base-mainnet.g.alchemy.com",
  ethereum: "eth-mainnet.g.alchemy.com",
  polygon: "polygon-mainnet.g.alchemy.com",
};

export interface Transfer {
  chain: EvmChain;
  /** ISO timestamp. */
  at: string;
  from: string;
  to: string;
  asset: string | null;
  value: number | null;
  direction: "in" | "out";
}

export interface EvmHistory {
  status: "ok" | "no_key" | "failed";
  transfers: Transfer[];
  message?: string;
  /** Per-chain outcome. One disabled network must not blind the others. */
  chains?: Array<{ chain: EvmChain; ok: boolean; transfers: number; message?: string }>;
}

async function transfersFor(
  chain: EvmChain,
  address: string,
  key: string,
  direction: "in" | "out",
): Promise<Transfer[]> {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "alchemy_getAssetTransfers",
    params: [
      {
        fromBlock: "0x0",
        toBlock: "latest",
        [direction === "in" ? "toAddress" : "fromAddress"]: address,
        category: ["external", "erc20"],
        withMetadata: true,
        excludeZeroValue: true,
        maxCount: "0x3e8",
        order: "desc",
      },
    ],
  };

  const res = await fetch(`https://${HOSTS[chain]}/v2/${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${chain} returned ${res.status}`);

  const json = (await res.json()) as {
    result?: {
      transfers?: Array<{
        from?: string;
        to?: string;
        asset?: string | null;
        value?: number | null;
        metadata?: { blockTimestamp?: string };
      }>;
    };
    error?: { message?: string };
  };
  if (json.error) throw new Error(json.error.message ?? `${chain} rejected the query`);

  return (json.result?.transfers ?? []).map((t) => ({
    chain,
    at: t.metadata?.blockTimestamp ?? "",
    from: (t.from ?? "").toLowerCase(),
    to: (t.to ?? "").toLowerCase(),
    asset: t.asset ?? null,
    value: typeof t.value === "number" ? t.value : null,
    direction,
  }));
}

export async function fetchEvmHistory(
  address: string,
  chains: EvmChain[] = ["base", "ethereum", "polygon"],
): Promise<EvmHistory> {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) {
    return {
      status: "no_key",
      transfers: [],
      message:
        "No ALCHEMY_API_KEY is configured, so I cannot read EVM transaction history. Holdings and live venue positions still work.",
    };
  }

  // Sequential, not parallel. Firing six of these at once tripped the free
  // tier's rate limit and a chain came back empty — which reads as "this
  // wallet did nothing" rather than "I was throttled". One retry covers a
  // transient limit.
  const perChain: Array<{ chain: EvmChain; ok: boolean; transfers: Transfer[]; message?: string }> = [];
  for (const chain of chains) {
    let attempt = 0;
    for (;;) {
      try {
        const into = await transfersFor(chain, address, key, "in");
        const outOf = await transfersFor(chain, address, key, "out");
        perChain.push({ chain, ok: true, transfers: [...into, ...outOf].filter((t) => t.at) });
        break;
      } catch (err) {
        if (attempt === 0) {
          attempt += 1;
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
        perChain.push({ chain, ok: false, transfers: [], message: (err as Error).message });
        break;
      }
    }
  }

  const transfers = perChain.flatMap((c) => c.transfers);
  transfers.sort((a, b) => a.at.localeCompare(b.at));
  const chainReport = perChain.map((c) => ({
    chain: c.chain,
    ok: c.ok,
    transfers: c.transfers.length,
    ...(c.message ? { message: c.message } : {}),
  }));

  if (perChain.every((c) => !c.ok)) {
    return {
      status: "failed",
      transfers: [],
      chains: chainReport,
      message: `No EVM chain could be read: ${perChain[0]?.message ?? "unknown error"}`,
    };
  }
  return { status: "ok", transfers, chains: chainReport };
}

export interface VenueUse {
  venue: string;
  kind: "perps" | "prediction" | "lending";
  interactions: number;
  firstAt: string;
  lastAt: string;
}

export interface EvmHabits {
  /** Venues this wallet actually used, from history rather than open positions. */
  venueUse: VenueUse[];
  /** Inbound stablecoin arrivals: the funding signature, same as on Solana. */
  funding: { depositCount: number; medianUsd: number | null; regularity: string; measured: string };
  /** Contracts this wallet keeps going back to — where its behaviour lives. */
  topCounterparties: Array<{ address: string; chain: EvmChain; interactions: number }>;
  windowDays: number | null;
}

const STABLE_ASSETS = new Set(["USDC", "USDT", "DAI", "USDC.E", "PYUSD"]);

/**
 * Venues worth naming. A wallet that keeps returning to a perps contract is
 * doing perps, whether or not a position is open right now — which is the
 * history that a balance check and a live-position check both miss.
 *
 * Addresses verified on Basescan rather than assumed.
 */
const KNOWN_CONTRACTS: Record<string, { venue: string; kind: "perps" | "prediction" | "lending" }> = {
  "0x44914408af82bc9983bbb330e3578e1105e11d4e": { venue: "Veranta", kind: "perps" },
  "0x8a311d7048c35985aa31c131b9a13e03a5f7422d": { venue: "Veranta", kind: "perps" },
};
const MIN_SPAN_DAYS = 21;
/** Below this, an inbound stablecoin transfer is crumbs, not a top-up. */
const MIN_DEPOSIT_USD = 1;

/** Sub-daily cadence rounded to "every 0 days", which reads like a bug. */
function describeGap(days: number): string {
  if (days >= 1.5) return `about every ${days.toFixed(0)} days`;
  if (days >= 0.75) return "about once a day";
  const perDay = 1 / days;
  return `about ${perDay.toFixed(0)} times a day`;
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function stddev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
}

/**
 * Pure, so it can be tested without a key. Same shape of reasoning as the
 * Solana side: cadence needs real time to span, and what is measured is
 * reported rather than what it is assumed to mean.
 */
export function deriveEvmHabits(address: string, transfers: Transfer[], sinceDays = 180): EvmHabits {
  const me = address.toLowerCase();
  const cutoff = Date.now() - sinceDays * 86400000;
  const recent = transfers.filter((t) => {
    const ms = Date.parse(t.at);
    return Number.isFinite(ms) && ms >= cutoff;
  });

  const stamps = recent.map((t) => Date.parse(t.at)).sort((a, b) => a - b);
  const windowDays = stamps.length >= 2 ? (stamps[stamps.length - 1] - stamps[0]) / 86400000 : null;

  const inbound = recent.filter(
    (t) =>
      t.direction === "in" &&
      t.to === me &&
      t.from !== me &&
      t.asset &&
      STABLE_ASSETS.has(t.asset.toUpperCase()) &&
      (t.value ?? 0) > 0,
  );
  // Dust is not funding. flexcopy.eth read as "110 deposits, regular" with a
  // median of $0.02 — Piggy congratulating somebody for topping themselves up
  // two cents at a time. Those are airdrop crumbs and change from contract
  // calls, not someone putting money in. The count that was dropped is
  // reported, because a reader comparing against a block explorer deserves to
  // know why the numbers differ.
  const deposits = inbound.filter((t) => (t.value ?? 0) >= MIN_DEPOSIT_USD);
  const dustIgnored = inbound.length - deposits.length;
  const depositTimes = deposits.map((d) => Date.parse(d.at)).sort((a, b) => a - b);
  const gapsDays = depositTimes.slice(1).map((t, i) => (t - depositTimes[i]) / 86400000);
  const spread = stddev(gapsDays);
  const spanDays =
    depositTimes.length >= 2
      ? (depositTimes[depositTimes.length - 1] - depositTimes[0]) / 86400000
      : 0;

  const meanGap = gapsDays.length > 0 ? gapsDays.reduce((a, b) => a + b, 0) / gapsDays.length : null;

  let regularity = "unknown";
  // Variation only means something next to the gap it varies against. Ten days
  // of spread is tight for monthly top-ups and meaningless for deposits that
  // land hourly — which is how 265 same-hour collateral cycles were being
  // called "regular". Regularity is now spread relative to the typical gap.
  if (
    deposits.length >= 3 &&
    spread !== null &&
    meanGap !== null &&
    meanGap > 0 &&
    spanDays >= MIN_SPAN_DAYS
  ) {
    regularity = spread <= meanGap ? "regular" : "irregular";
  }

  const counts = new Map<string, { chain: EvmChain; n: number }>();
  for (const t of recent) {
    const other = t.direction === "out" ? t.to : t.from;
    if (!other || other === me) continue;
    const key = `${t.chain}:${other}`;
    const prev = counts.get(key);
    counts.set(key, { chain: t.chain, n: (prev?.n ?? 0) + 1 });
  }

  const topCounterparties = [...counts.entries()]
    .map(([key, v]) => ({ address: key.split(":")[1], chain: v.chain, interactions: v.n }))
    .sort((a, b) => b.interactions - a.interactions)
    .slice(0, 8);

  // Which known venues this wallet used, and over what stretch.
  const venueAgg = new Map<string, { kind: VenueUse["kind"]; n: number; first: string; last: string }>();
  for (const t of recent) {
    const other = t.direction === "out" ? t.to : t.from;
    const known = KNOWN_CONTRACTS[other];
    if (!known) continue;
    const prev = venueAgg.get(known.venue);
    venueAgg.set(known.venue, {
      kind: known.kind,
      n: (prev?.n ?? 0) + 1,
      first: prev && prev.first < t.at ? prev.first : t.at,
      last: prev && prev.last > t.at ? prev.last : t.at,
    });
  }
  const venueUse: VenueUse[] = [...venueAgg.entries()].map(([venue, v]) => ({
    venue,
    kind: v.kind,
    interactions: v.n,
    firstAt: v.first,
    lastAt: v.last,
  }));

  return {
    venueUse,
    funding: {
      depositCount: deposits.length,
      medianUsd: median(deposits.map((d) => d.value ?? 0)),
      regularity,
      measured:
        deposits.length === 0
          ? `No inbound stablecoin transfers in the last ${sinceDays} days.`
          : `${deposits.length} inbound stablecoin transfers over $1 in about ${spanDays.toFixed(0)} days${
              dustIgnored > 0 ? `, ignoring ${dustIgnored} under $1` : ""
            }${
              spanDays < MIN_SPAN_DAYS
                ? " — too short a stretch to call a rhythm"
                : spread !== null && meanGap !== null
                  ? `, arriving ${describeGap(meanGap)} and varying by about ${spread < 1 ? `${(spread * 24).toFixed(0)} hours` : `${spread.toFixed(0)} days`}`
                  : ""
            }.`,
    },
    topCounterparties,
    windowDays,
  };
}
