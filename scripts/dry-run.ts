/**
 * Runs the whole analyze pipeline against a real wallet, without the paywall.
 *
 *   npm run dry -- flexcopy.eth
 *   npm run dry -- 0x99277559426303853a96e2e59dBDB58B25D68C4a
 *
 * /api/analyze costs $0.02 a call, which makes "just try it and see" an
 * expensive way to check output. This prints exactly what the card and the
 * PayBox window will say, for free. It is also how the plan was caught telling
 * an Ethereum wallet to stake SOL through a Solana plugin.
 *
 * Needs .env.local with ALCHEMY_API_KEY and HELIUS_API_KEY.
 */
import fs from "node:fs";
import { resolveEns } from "../lib/ens.ts";
import { fetchWallet } from "../lib/wallet.ts";
import { fetchEvmHistory, deriveEvmHabits } from "../lib/evm-history.ts";
import { fetchPositions } from "../lib/positions.ts";
import { composition } from "../lib/composition.ts";
import {
  blindSpots,
  buildPlan,
  computeStats,
  pickBand,
  pickMood,
  pickPersona,
  pickScenario,
} from "../lib/piggy.ts";

try {
  for (const line of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^\\/, "");
  }
} catch {
  console.warn("No .env.local — falling back to public endpoints, which read far less.\n");
}

const input = process.argv[2] ?? "flexcopy.eth";
const addr = /^0x/.test(input) ? input : await resolveEns(input);
if (!addr) throw new Error(`could not resolve ${input}`);
console.log(`${input} -> ${addr}\n`);

const w = await fetchWallet(addr);
console.log(`holdings: ${w.balances.length} tokens, ${w.advertsIgnored ?? 0} adverts ignored`);

const hist = await fetchEvmHistory(addr);
console.log(`history: ${hist.status}`, hist.status === "ok" ? `${hist.transfers.length} transfers` : hist.message);

let req: Parameters<typeof computeStats>[0] = {
  addresses: [addr],
  wallets: [{ chain: w.chain, address: addr, balances: w.balances }],
};

let perpsHistory: Array<{ venue: string; interactions: number; firstAt: string; lastAt: string }> = [];
if (hist.status === "ok") {
  const habits = deriveEvmHabits(addr, hist.transfers);
  perpsHistory = habits.venueUse.filter((v) => v.kind === "perps");
  console.log("funding:", JSON.stringify(habits.funding));
  console.log("venues used:", habits.venueUse.length ? JSON.stringify(habits.venueUse) : "none recognised");
}

const found = await fetchPositions([addr]);
console.log("venues checked:", found.checked.map((c) => `${c.venue}:${c.ok ? "ok" : "failed"}`).join(" "));
console.log("open perps:", found.perps.length, "| prediction markets:", found.predictionMarkets.length);
if (found.perps.length || found.predictionMarkets.length) {
  req = { ...req, positions: { perps: found.perps, predictionMarkets: found.predictionMarkets } };
}

const stats = computeStats(req, "Alchemy (Ethereum, Base, Polygon)");
const persona = pickPersona(req, stats);
const mood = pickMood(stats, persona, undefined, perpsHistory);
const scenario = pickScenario(req, stats, undefined, perpsHistory);
const band = pickBand(stats);

console.log("\n================ THE CARD ================");
console.log(`total      $${stats.totalUsd.value?.toFixed(2) ?? "unknown"}  (band: ${band.band})`);
console.log(`persona    ${persona.name}`);
console.log(`           ${persona.because}`);
console.log(`mood       ${mood.mood}`);
console.log(`           ${mood.because}`);
console.log(`scenario   ${scenario.scenario} — ${scenario.because}`);
console.log(`shares     ${composition({
  stableShare: stats.stableShare.value,
  stakedShare: stats.stakedShare.value,
  longTailShare: stats.longTailShare.value,
  majorShare: stats.majorShare.value,
}).map((s) => `${Math.round(s.share * 100)}% ${s.label}`).join("  ·  ") || "(none to show)"}`);

console.log("\nplan:");
for (const step of buildPlan(req, stats, perpsHistory).steps) console.log(`  - ${step.action}\n      piggy: ${step.piggySays}\n      risk:  ${step.risk}${step.executeWith ? "\n      via:   " + step.executeWith : ""}`);

console.log("\nblind spots:");
for (const b of blindSpots(req, stats, undefined, undefined, found.checked.filter((c) => c.ok).map((c) => c.venue), w.advertsIgnored)) {
  console.log(`  - ${b}`);
}
