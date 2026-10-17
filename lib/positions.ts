/**
 * Perps and gambling positions, read live from each venue.
 *
 * Balances only ever showed what someone holds. A leveraged position is not a
 * balance — it is state at a venue — so Piggy was blind to the single riskiest
 * thing a wallet can be doing. This reads it directly:
 *
 *   Hyperliquid  public info API, no key. Gives open positions AND leverage.
 *   Veranta/Base a gTrade-style perps venue. openTradesCount is a plain view
 *                call, so current positions are one eth_call per pair — no
 *                indexer, no API key, no log scanning.
 *
 * Why not scan history for EVM: every free Base RPC caps eth_getLogs (50
 * blocks, or 10k, or needs a paid token), so walking months of history is not
 * possible without a paid indexer. Reading current state has no such limit,
 * and "what are you in right now" is the more useful question anyway.
 */

export interface PerpPosition {
  venue: string;
  symbol: string;
  notionalUsd?: number;
  leverage?: number;
}

export interface PositionsFetch {
  perps: PerpPosition[];
  /** What was checked and what came back, so silence is distinguishable from absence. */
  checked: Array<{ venue: string; chain: string; ok: boolean; found: number; message?: string }>;
}

const BASE_RPC = "https://mainnet.base.org";
/** Veranta V1.5 on Base. Trading contract and its storage, from Basescan. */
const VERANTA_STORAGE = "0x8a311d7048c35985aa31c131b9a13e03a5f7422d";
/** openTradesCount(address,uint256) */
const OPEN_TRADES_COUNT = "1c8636b4";
/** Pairs to check. Low indexes are the majors on gTrade-style venues. */
const VERANTA_PAIRS = 12;

const pad = (addr: string) => addr.replace(/^0x/, "").toLowerCase().padStart(64, "0");
const word = (n: number) => n.toString(16).padStart(64, "0");

async function ethCall(to: string, data: string): Promise<string | null> {
  try {
    const res = await fetch(BASE_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
    });
    const body = (await res.json()) as { result?: string; error?: unknown };
    return body.error || typeof body.result !== "string" ? null : body.result;
  } catch {
    return null;
  }
}

/**
 * Hyperliquid's info endpoint is public and returns live positions with the
 * leverage attached, which is the number that actually matters.
 */
export async function fetchHyperliquid(address: string): Promise<{
  perps: PerpPosition[];
  ok: boolean;
  message?: string;
}> {
  try {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "clearinghouseState", user: address }),
    });
    if (!res.ok) return { perps: [], ok: false, message: `Hyperliquid returned ${res.status}` };

    const body = (await res.json()) as {
      assetPositions?: Array<{
        position?: {
          coin?: string;
          positionValue?: string;
          leverage?: { value?: number };
        };
      }>;
    };

    const perps: PerpPosition[] = [];
    for (const entry of body.assetPositions ?? []) {
      const p = entry.position;
      if (!p?.coin) continue;
      const notional = Number(p.positionValue);
      perps.push({
        venue: "Hyperliquid",
        symbol: p.coin,
        ...(Number.isFinite(notional) ? { notionalUsd: notional } : {}),
        ...(typeof p.leverage?.value === "number" ? { leverage: p.leverage.value } : {}),
      });
    }
    return { perps, ok: true };
  } catch (err) {
    return { perps: [], ok: false, message: `Could not reach Hyperliquid: ${(err as Error).message}` };
  }
}

/**
 * Veranta on Base. openTradesCount per pair tells us whether a position is
 * open right now. The per-trade struct holds leverage, but decoding it is
 * fragile across forks, so Piggy reports the open position and says the
 * leverage is unknown rather than guessing a number.
 */
export async function fetchVeranta(address: string): Promise<{
  perps: PerpPosition[];
  ok: boolean;
  message?: string;
}> {
  const results = await Promise.all(
    Array.from({ length: VERANTA_PAIRS }, (_, pair) =>
      ethCall(VERANTA_STORAGE, `0x${OPEN_TRADES_COUNT}${pad(address)}${word(pair)}`).then((hex) => ({
        pair,
        count: hex ? Number(BigInt(hex)) : null,
      })),
    ),
  );

  if (results.every((r) => r.count === null)) {
    return { perps: [], ok: false, message: "Veranta did not answer; open positions unknown." };
  }

  const perps: PerpPosition[] = [];
  for (const r of results) {
    for (let i = 0; i < (r.count ?? 0); i += 1) {
      perps.push({ venue: "Veranta (Base)", symbol: `pair ${r.pair}` });
    }
  }
  return { perps, ok: true };
}

/** Everything Piggy can check for one address, in parallel. */
export async function fetchPositions(addresses: string[]): Promise<PositionsFetch> {
  const evm = addresses.filter((a) => /^0x[a-fA-F0-9]{40}$/.test(a));
  const perps: PerpPosition[] = [];
  const checked: PositionsFetch["checked"] = [];

  for (const address of evm.slice(0, 3)) {
    const [hl, vr] = await Promise.all([fetchHyperliquid(address), fetchVeranta(address)]);

    perps.push(...hl.perps, ...vr.perps);
    checked.push({
      venue: "Hyperliquid",
      chain: "hyperliquid",
      ok: hl.ok,
      found: hl.perps.length,
      ...(hl.message ? { message: hl.message } : {}),
    });
    checked.push({
      venue: "Veranta",
      chain: "base",
      ok: vr.ok,
      found: vr.perps.length,
      ...(vr.message ? { message: vr.message } : {}),
    });
  }

  return { perps, checked };
}
