/**
 * Audits Piggy against real wallets.
 *
 *   npm run audit                    # the default set
 *   npm run audit -- a.eth 0x… So1…  # specific wallets
 *   npm run audit -- --solana 20     # plus 20 live Solana wallets
 *
 * This runs `lib/analyze.ts` — the same function the paid endpoint runs — so
 * what it checks is what a caller is charged for, and it costs nothing.
 *
 * It does not print output for a human to skim and approve. It asserts the
 * things that must never be true at once: a mood that praises a wallet whose
 * scenario flags gambling, a band that disagrees with the total, a number
 * rendered as "undefined", a claim of regular funding on dust. Reading a
 * hundred wallets by eye is how contradictions get missed.
 */

import fs from "node:fs";
import { analyze } from "../lib/analyze.ts";
import type { AnalyzeResponse } from "../lib/types.ts";

try {
  for (const line of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^\\/, "");
  }
} catch {
  console.warn("No .env.local — public endpoints read far less, so findings will be thin.\n");
}

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/**
 * Live Solana wallets, taken from recent USDC transfers.
 *
 * Hardcoding a list of "popular wallets" would audit whichever wallets I
 * happened to think of, which is not a sample of anything. These are whoever
 * actually moved USDC in the last few minutes.
 */
async function liveSolanaWallets(want: number): Promise<string[]> {
  const key = process.env.HELIUS_API_KEY;
  if (!key) return [];
  const rpc = async (method: string, params: unknown[]) => {
    const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const body = (await res.json()) as { result?: unknown };
    return body.result;
  };
  const seen = new Set<string>();
  try {
    const sigs = (await rpc("getSignaturesForAddress", [USDC, { limit: 25 }])) as
      | Array<{ signature: string }>
      | undefined;
    for (const s of sigs ?? []) {
      if (seen.size >= want) break;
      const tx = (await rpc("getTransaction", [
        s.signature,
        { encoding: "jsonParsed", maxSupportedTransactionVersion: 1 },
      ])) as { meta?: { postTokenBalances?: Array<{ owner?: string; mint?: string }> } } | null;
      for (const b of tx?.meta?.postTokenBalances ?? []) {
        if (b.mint === USDC && b.owner && seen.size < want) seen.add(b.owner);
      }
    }
  } catch {
    // A thin sample is better than no audit.
  }
  return [...seen];
}

interface Finding {
  wallet: string;
  severity: "high" | "medium" | "low";
  what: string;
}

const PLACEHOLDERS = /\b(undefined|NaN|\[object Object\]|Infinity)\b|\$NaN|\bnull\b/;

/** Everything that must never be true at once. */
function audit(wallet: string, r: AnalyzeResponse): Finding[] {
  const out: Finding[] = [];
  const add = (severity: Finding["severity"], what: string) =>
    out.push({ wallet, severity, what });

  // Anything a user reads must be finished prose, not a leaked value.
  const prose: Array<[string, string | undefined]> = [
    ["persona.because", r.persona.because],
    ["mood.because", r.mood.because],
    ["scenario.because", r.scenario.because],
    ["band.because", r.band.because],
    ["cohort.note", r.cohort.note],
    ["history.message", r.history?.message],
    ["evmHistory.funding.measured", r.evmHistory?.funding?.measured],
    ...r.plan.steps.flatMap((s, i): Array<[string, string]> => [
      [`plan[${i}].action`, s.action],
      [`plan[${i}].piggySays`, s.piggySays],
      [`plan[${i}].risk`, s.risk],
    ]),
    ...(r.blindSpots ?? []).map((b, i): [string, string] => [`blindSpots[${i}]`, b]),
  ];
  for (const [where, text] of prose) {
    if (text === undefined) continue;
    if (PLACEHOLDERS.test(text)) add("high", `${where} leaks a raw value: "${text.slice(0, 90)}"`);
    if (text.trim() === "") add("high", `${where} is empty`);
  }

  const total = r.stats.totalUsd.value;
  const stable = r.stats.stableShare.value;
  const staked = r.stats.stakedShare.value;
  const longTail = r.stats.longTailShare.value;
  const major = r.stats.majorShare.value;

  // Shares are a split of one wallet and have to behave like one.
  if ([stable, staked, longTail, major].every((v) => typeof v === "number")) {
    const sum = (stable ?? 0) + (staked ?? 0) + (longTail ?? 0) + (major ?? 0);
    if (Math.abs(sum - 1) > 0.02) add("high", `shares sum to ${sum.toFixed(3)}, not 1`);
    for (const [name, v] of [["stable", stable], ["staked", staked], ["longTail", longTail], ["major", major]] as const) {
      if ((v ?? 0) < -0.001 || (v ?? 0) > 1.001) add("high", `${name}Share is ${v}`);
    }
  }

  // The band is a statement about size and must match the number.
  if (typeof total === "number") {
    const expected =
      total <= 0 ? "empty" : total < 25 ? "dust" : total < 10_000 ? "shrimp" : total < 250_000 ? "mid" : "whale";
    if (r.band.band !== expected) {
      add("high", `band "${r.band.band}" but total is $${total.toFixed(2)} (expected "${expected}")`);
    }
  }

  // Mood and scenario sit on the same card and must not contradict.
  const gamblingScenario = r.scenario.scenario === "perps_leverage" || r.scenario.scenario === "gambling";
  const praising = r.mood.mood === "proud" || r.mood.mood === "happy" || r.mood.mood === "excited";
  if (gamblingScenario && praising) {
    add("high", `scenario "${r.scenario.scenario}" but mood is "${r.mood.mood}" — the card contradicts itself`);
  }
  if (/nothing silly|no notes|this is fine/i.test(r.mood.because) && gamblingScenario) {
    add("high", `mood says "${r.mood.because.slice(0, 60)}" while the scenario flags ${r.scenario.scenario}`);
  }

  // An open position is the loudest fact Piggy has; it must lead the plan.
  const openPerps = (r.plan.steps ?? []).length > 0;
  const hasExposure = typeof r.stats.gamblingExposureUsd.value === "number" && r.stats.gamblingExposureUsd.value > 0;
  if (hasExposure && openPerps && !/leverage|perps|prediction|bets/i.test(r.plan.steps[0].action)) {
    add("medium", `money is at risk but the plan leads with "${r.plan.steps[0].action}"`);
  }
  if (hasExposure && r.plan.steps.every((s) => !/leverage|perps|prediction|bets/i.test(s.action))) {
    add("high", "exposure is reported but no plan step mentions it");
  }

  // Exposure without a position behind it would be a number from nowhere.
  const positionsSeen =
    (r.venuesChecked ?? []).some((v) => v.ok) || (r.evmHistory?.venueUse ?? []).length > 0;
  if (hasExposure && !positionsSeen) add("high", "exposure reported but no venue was read");

  // Funding claims have to survive their own numbers.
  const f = r.evmHistory?.funding;
  if (f && f.regularity === "regular" && typeof f.medianUsd === "number" && f.medianUsd < 1) {
    add("high", `funding called "regular" with a median deposit of $${f.medianUsd}`);
  }
  if (f && f.depositCount === 0 && f.regularity !== "unknown") {
    add("high", `funding regularity "${f.regularity}" with zero deposits`);
  }
  if (r.history?.funding?.regularity === "regular" && (r.history.funding.depositCount ?? 0) < 3) {
    add("high", `Solana funding called "regular" on ${r.history.funding.depositCount} deposits`);
  }

  // A plan is the product. An empty one is a dead end.
  if (r.plan.steps.length === 0) add("high", "no plan steps at all");

  // Execution plugins act on Solana; naming one is only honest if the money
  // can get there, and the step has to say so.
  const onSolana = (r.resolved ?? []).some((x) => x.chain === "solana" && x.ok);
  for (const s of r.plan.steps) {
    if (!s.executeWith) continue;
    if (!onSolana && !/reach Solana/.test(s.risk)) {
      add("medium", `"${s.action}" names ${s.executeWith} without saying the funds must reach Solana`);
    }
    if (/\bSOL\b/.test(s.action) && !onSolana) {
      add("high", `"${s.action}" talks about SOL on a wallet with none`);
    }
  }

  // Every figure carries a basis, and "observed" has to mean someone observed it.
  for (const [name, v] of Object.entries(r.stats)) {
    const valued = v as { value: unknown; basis: string; source: string };
    if (valued.value === null && valued.basis === "observed") {
      add("medium", `stats.${name} is null but claims basis "observed"`);
    }
    if (valued.value !== null && valued.basis === "unknown") {
      add("medium", `stats.${name} has a value but claims basis "unknown"`);
    }
    if (!valued.source || PLACEHOLDERS.test(valued.source)) {
      add("medium", `stats.${name} has no usable source ("${valued.source}")`);
    }
    if (/PayBox get_portfolio/.test(valued.source) && (r.resolved ?? []).length > 0) {
      add("high", `stats.${name} credits PayBox for a figure Piggy fetched itself`);
    }
  }

  // Advert tokens must not survive into anything a user reads. Matched against
  // the prose only: stringifying the objects matched "claim" inside the plan's
  // own `disclaimer` key and flagged all thirteen wallets.
  // Bare words are no good here: Piggy legitimately writes "I will not claim
  // that without a number" and "airdropped tokens". A scam symbol always
  // carries a link or a domain, so that is what this looks for.
  const advertish = /https?:\/\/|\bt\.me\/|[a-z0-9-]+\.(?:xyz|vercel\.app|site|link|top|vip|finance)\b/i;
  for (const [where, text] of prose) {
    if (text && advertish.test(text)) {
      add("high", `${where} repeats scam-token text: "${text.slice(0, 80)}"`);
    }
  }

  // The card is the shareable artifact; a broken link is the whole product.
  if (!/^https?:\/\/.+\/(c|card)\/.+/.test(r.cardUrl ?? "")) {
    add("high", `cardUrl looks wrong: ${r.cardUrl}`);
  }

  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  let solanaCount = 0;
  const explicit: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--solana") {
      solanaCount = Number(argv[i + 1] ?? 10);
      i += 1;
    } else explicit.push(argv[i]);
  }

  const wallets = explicit.length > 0 ? explicit : [...DEFAULT_SET];
  if (solanaCount > 0 || explicit.length === 0) {
    const live = await liveSolanaWallets(solanaCount || 8);
    if (live.length === 0) console.warn("Could not sample live Solana wallets.\n");
    wallets.push(...live);
  }

  const findings: Finding[] = [];
  let read = 0;
  let refused = 0;

  for (const w of wallets) {
    process.stdout.write(`${w.slice(0, 44).padEnd(46)}`);
    let outcome;
    try {
      outcome = await analyze({ addresses: [w] }, { origin: "https://lil-piggy.vercel.app", persistCard: false });
    } catch (err) {
      findings.push({ wallet: w, severity: "high", what: `threw: ${(err as Error).message}` });
      console.log("THREW");
      continue;
    }
    if (!outcome.ok) {
      refused += 1;
      console.log(`refused — ${outcome.error.slice(0, 60)}`);
      continue;
    }
    read += 1;
    const r = outcome.response;
    const found = audit(w, r);
    findings.push(...found);
    const total = r.stats.totalUsd.value;
    console.log(
      `${(total === null ? "unpriced" : `$${total.toFixed(0)}`).padStart(10)}  ${r.band.band.padEnd(7)} ${r.persona.name.padEnd(18)} ${r.mood.mood.padEnd(11)} ${r.scenario.scenario.padEnd(16)} ${found.length ? `${found.length} FLAG` : "ok"}`,
    );
  }

  console.log(`\n${read} wallets read, ${refused} refused, ${findings.length} findings\n`);
  for (const sev of ["high", "medium", "low"] as const) {
    const group = findings.filter((f) => f.severity === sev);
    if (group.length === 0) continue;
    console.log(`${sev.toUpperCase()} (${group.length})`);
    for (const f of group) console.log(`  ${f.wallet.slice(0, 20)}…  ${f.what}`);
    console.log();
  }
  if (findings.some((f) => f.severity === "high")) process.exitCode = 1;
}

/**
 * Wallets chosen to hit different shapes, not because they are famous: a
 * well-known EVM wallet, one that is mostly a single major, a payout wallet
 * with a perps past, an address that cannot be read, and a contract.
 */
const DEFAULT_SET = [
  "vitalik.eth",
  "flexcopy.eth",
  "0x99277559426303853a96e2e59dBDB58B25D68C4a",
  "not-an-address",
  "0x0000000000000000000000000000000000000000",
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
];

await main();
