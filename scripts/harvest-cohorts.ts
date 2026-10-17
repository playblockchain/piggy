/**
 * Builds real cohorts from chain data, using Helius.
 *
 *     npm run harvest -- --wallets 200 --out ~/Downloads/cohorts.csv
 *
 * Why not Dune: its free tier lost query execution for older accounts, and the
 * free engine times out after 2 minutes — our six-month scan would not finish.
 * More importantly, harvesting here means cohorts are measured by the SAME code
 * that measures the individual user (deriveHabits), so the two definitions
 * cannot drift apart.
 *
 * How it works:
 *   1. Scan recent transactions touching the USDC mint to find candidate wallets.
 *   2. For each candidate, pull its history and run deriveHabits on it.
 *   3. Drop infrastructure (routers, market makers) — not somebody's savings.
 *   4. Group survivors by funding signature, classify behaviour, check survival.
 *
 * The sample's bias is real and must travel with the numbers: these are wallets
 * that moved USDC recently, not a random draw of all wallets. That is why the
 * output names its own method, and why `check-cohorts` refuses anything that
 * cannot say where it came from.
 */

import fs from "node:fs";
import { deriveHabits, type ParsedTx } from "../lib/history.ts";

const KEY = process.env.HELIUS_API_KEY ?? readKeyFromEnvFile();
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const RPC = `https://mainnet.helius-rpc.com/?api-key=${KEY}`;
const API = "https://api.helius.xyz/v0";

function readKeyFromEnvFile(): string {
  try {
    const line = fs
      .readFileSync(new URL("../.env.local", import.meta.url), "utf8")
      .split("\n")
      .find((l) => l.startsWith("HELIUS_API_KEY="));
    return line ? line.slice("HELIUS_API_KEY=".length).trim() : "";
  } catch {
    return "";
  }
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const TARGET_WALLETS = Number(arg("wallets", "150"));
const OUT = arg("out", "cohorts.csv");
const SCAN_PAGES = Number(arg("pages", "6"));

/** Helius free tier is 10 req/s. Stay well under it. */
const GAP_MS = 140;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`${method} returned ${res.status}`);
  const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message ?? "rpc error"}`);
  return body.result;
}

async function history(address: string, limit = 100): Promise<ParsedTx[]> {
  const url = `${API}/addresses/${address}/transactions?api-key=${KEY}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const body = await res.json();
  return Array.isArray(body) ? (body as ParsedTx[]) : [];
}

/** Step 1: candidate wallets, from recent USDC movement. */
async function findCandidates(): Promise<string[]> {
  const seen = new Set<string>();
  let before: string | undefined;

  for (let page = 0; page < SCAN_PAGES; page += 1) {
    const sigs = (await rpc("getSignaturesForAddress", [
      USDC,
      before ? { limit: 50, before } : { limit: 50 },
    ])) as Array<{ signature: string }>;
    if (!sigs?.length) break;
    before = sigs[sigs.length - 1].signature;

    for (const s of sigs) {
      await sleep(GAP_MS);
      try {
        const tx = (await rpc("getTransaction", [
          s.signature,
          { encoding: "jsonParsed", maxSupportedTransactionVersion: 1 },
        ])) as { meta?: { postTokenBalances?: Array<{ owner?: string; mint?: string }> } } | null;
        for (const b of tx?.meta?.postTokenBalances ?? []) {
          if (b.mint === USDC && b.owner) seen.add(b.owner);
        }
      } catch {
        // A single unreadable transaction is not worth stopping for.
      }
      if (seen.size >= TARGET_WALLETS * 3) break;
    }
    process.stdout.write(`\r  scanned page ${page + 1}, ${seen.size} candidates`);
    if (seen.size >= TARGET_WALLETS * 3) break;
  }
  process.stdout.write("\n");
  return [...seen];
}

interface Profiled {
  wallet: string;
  signature: string;
  behaviour: string;
  stillFunded: boolean;
}

/** Step 2-4: profile each candidate with the same code the live endpoint uses. */
async function profile(wallet: string): Promise<Profiled | null> {
  const txs = await history(wallet);
  if (txs.length < 5) return null;

  const h = deriveHabits(wallet, txs);
  if (h.walletKind.kind === "infrastructure") return null;

  // Funding signature: the cohort key.
  const signature =
    h.funding.regularity === "regular"
      ? "regular_topup"
      : h.funding.regularity === "irregular"
        ? "irregular_topup"
        : "mixed";

  // Behaviour, from the same window of history.
  const swaps = txs.filter((t) => t.type === "SWAP").length;
  const behaviour = h.raidingSavings.detected
    ? "raided_savings"
    : h.dca.detected
      ? "bought_on_a_rhythm"
      : swaps >= 60
        ? "overtraded"
        : "held_steady";

  // Survival: does the wallet still hold meaningful USDC or SOL?
  let stillFunded = false;
  try {
    await sleep(GAP_MS);
    const accs = (await rpc("getTokenAccountsByOwner", [
      wallet,
      { mint: USDC },
      { encoding: "jsonParsed" },
    ])) as { value?: Array<{ account: { data: { parsed: { info: { tokenAmount: { uiAmount: number } } } } } }> };
    const usdc = accs?.value?.[0]?.account.data.parsed.info.tokenAmount.uiAmount ?? 0;
    await sleep(GAP_MS);
    const lamports = (await rpc("getBalance", [wallet])) as { value?: number };
    const sol = (lamports?.value ?? 0) / 1e9;
    stillFunded = usdc >= 25 || sol >= 0.15;
  } catch {
    return null; // Cannot verify survival, so this wallet does not get counted.
  }

  return { wallet, signature, behaviour, stillFunded };
}

async function main() {
  if (!KEY) {
    console.error("harvest: no HELIUS_API_KEY (env or .env.local)");
    process.exit(1);
  }

  console.log("harvest: finding candidate wallets from recent USDC movement");
  const candidates = await findCandidates();
  console.log(`harvest: ${candidates.length} candidates, profiling up to ${TARGET_WALLETS}`);

  const profiled: Profiled[] = [];
  let infra = 0;
  let thin = 0;

  for (const wallet of candidates) {
    if (profiled.length >= TARGET_WALLETS) break;
    await sleep(GAP_MS);
    try {
      const p = await profile(wallet);
      if (p) profiled.push(p);
      else infra += 1;
    } catch {
      thin += 1;
    }
    process.stdout.write(
      `\r  profiled ${profiled.length}, skipped ${infra} (infrastructure or thin), ${thin} errors`,
    );
  }
  process.stdout.write("\n");

  if (profiled.length === 0) {
    console.error("harvest: nothing survived profiling — no CSV written");
    process.exit(1);
  }

  // Aggregate into the shape import-cohorts expects.
  const groups = new Map<string, Profiled[]>();
  for (const p of profiled) {
    const key = `${p.signature}\u0000${p.behaviour}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  const rows = [...groups.entries()].map(([key, members]) => {
    const [signature, behaviour] = key.split("\u0000");
    const funded = members.filter((m) => m.stillFunded).length;
    return {
      funding_signature: signature,
      behaviour,
      wallets: members.length,
      still_funded_share: Number((funded / members.length).toFixed(3)),
    };
  });

  const csv = [
    "funding_signature,behaviour,wallets,still_funded_share",
    ...rows.map((r) => `${r.funding_signature},${r.behaviour},${r.wallets},${r.still_funded_share}`),
  ].join("\n");
  fs.writeFileSync(OUT, `${csv}\n`);

  console.log(`\nharvest: ${profiled.length} wallets profiled, written to ${OUT}\n`);
  for (const r of rows.sort((a, b) => b.wallets - a.wallets)) {
    console.log(
      `  ${r.funding_signature.padEnd(16)} ${r.behaviour.padEnd(20)} ${String(r.wallets).padStart(4)} wallets, ${(r.still_funded_share * 100).toFixed(0)}% still funded`,
    );
  }
  console.log(
    "\nSample bias, which must travel with these numbers: wallets that moved USDC recently, not a random draw.",
  );
}

main().catch((err) => {
  console.error("harvest failed:", (err as Error).message);
  process.exit(1);
});
