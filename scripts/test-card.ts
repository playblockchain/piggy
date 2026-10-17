/**
 * Tests for what the card displays.
 *
 * These exist because of a real bug: the card had three fixed slots —
 * stablecoins, staked, long-tail — and a wallet holding nothing but ETH scored
 * zero in all three. The card read "0% · 0% · 0%" about a wallet that was 100%
 * one asset, which looks like a broken product and was in fact correct
 * arithmetic shown in the wrong three boxes.
 *
 * Run with: npm run test:card
 */

import assert from "node:assert/strict";
import { composition } from "../lib/composition.ts";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`FAIL  ${name}\n      ${(err as Error).message}`);
  }
}

console.log("composition()");

check("an all-ETH wallet reads as majors, not three zeros", () => {
  // flexcopy.eth, read live on 17 Oct 2026: $43 of ETH across Ethereum and
  // Base, no stables, nothing staked, a rounding crumb of long-tail.
  const slices = composition({
    stableShare: 0,
    stakedShare: 0,
    longTailShare: 0.00033,
    majorShare: 0.99967,
  });
  assert.equal(slices.length, 1, "only one slice is worth showing");
  assert.equal(slices[0].label, "in majors");
  assert.equal(Math.round(slices[0].share * 100), 100);
});

check("majors is derived for cards made before it was carried", () => {
  // Old payloads have no majorShare. The four buckets are exhaustive, so it is
  // exactly what the other three leave over — no guessing involved.
  const slices = composition({ stableShare: 0.2, stakedShare: 0.1, longTailShare: 0.1 });
  assert.deepEqual(
    slices.map((s) => [s.label, Math.round(s.share * 100)]),
    [
      ["in majors", 60],
      ["in stablecoins", 20],
      ["staked", 10],
    ],
  );
});

check("slices come back largest first", () => {
  const slices = composition({
    stableShare: 0.1,
    stakedShare: 0.6,
    longTailShare: 0.3,
    majorShare: 0,
  });
  assert.deepEqual(slices.map((s) => s.label), ["staked", "long-tail", "in stablecoins"]);
});

check("at most three slices are shown", () => {
  const slices = composition({
    stableShare: 0.25,
    stakedShare: 0.25,
    longTailShare: 0.25,
    majorShare: 0.25,
  });
  assert.equal(slices.length, 3);
});

check("a slice that rounds to zero is dropped, not printed as 0%", () => {
  const slices = composition({
    stableShare: 0.96,
    stakedShare: 0.004,
    longTailShare: 0.036,
    majorShare: 0,
  });
  assert.deepEqual(slices.map((s) => s.label), ["in stablecoins", "long-tail"]);
});

check("nothing priced means no slices at all, never a row of zeros", () => {
  assert.deepEqual(
    composition({ stableShare: null, stakedShare: null, longTailShare: null }),
    [],
  );
});

check("an empty wallet has no split to show", () => {
  // Shares are null when the total is zero, which is the Clean Slate card.
  assert.deepEqual(
    composition({ stableShare: null, stakedShare: null, longTailShare: null, majorShare: null }),
    [],
  );
});

check("a stablecoin wallet still reads the way it always did", () => {
  // The regression guard: the case that was already right must stay right.
  const slices = composition({
    stableShare: 0.82,
    stakedShare: 0.15,
    longTailShare: 0.03,
    majorShare: 0,
  });
  assert.deepEqual(
    slices.map((s) => [s.label, Math.round(s.share * 100)]),
    [
      ["in stablecoins", 82],
      ["staked", 15],
      ["long-tail", 3],
    ],
  );
});

console.log("\nbuildPlan() — chain awareness");

const { buildPlan } = await import("../lib/piggy.ts");
const { computeStats } = await import("../lib/piggy.ts");

const wallet = (chain: "solana" | "evm", balances: Array<{ symbol: string; amount: number; usdValue?: number }>) => ({
  wallets: [{ chain, address: chain === "solana" ? "SoLAddr" : "0xabc", balances }],
});

check("an EVM wallet is not told to move SOL it does not hold", () => {
  // flexcopy.eth: all ETH, nothing staked. It was told to "move some SOL into
  // liquid staking" — an asset it does not have.
  const req = wallet("evm", [{ symbol: "ETH", amount: 0.018, usdValue: 43 }]);
  const steps = buildPlan(req, computeStats(req)).steps;
  const staking = steps.find((s) => s.action.includes("liquid staking"));
  assert.ok(staking, "a wallet with nothing staked still gets the suggestion");
  assert.doesNotMatch(staking.action, /move some SOL/i);
  assert.doesNotMatch(staking.piggySays, /\bSOL\b/);
});

check("an EVM wallet is still pointed at the PayBox plugins", () => {
  // Reading is multichain, execution is Solana on purpose: the plan exists so
  // the user can carry it out inside Claude through Kamino, Jupiter and
  // Sunrise. Stripping the plugin out for EVM wallets removed the point.
  const req = wallet("evm", [
    { symbol: "USDC", amount: 900, usdValue: 900 },
    { symbol: "ETH", amount: 0.04, usdValue: 100 },
  ]);
  const steps = buildPlan(req, computeStats(req)).steps;
  assert.match(JSON.stringify(steps), /Kamino/);
  assert.ok(steps.some((s) => s.executeWith?.includes("PayBox plugin")));
});

check("an EVM wallet is told the money has to reach Solana first", () => {
  // Naming a Solana plugin to a wallet with nothing on Solana is only honest
  // if the step says so, rather than implying one click.
  const req = wallet("evm", [{ symbol: "USDC", amount: 900, usdValue: 900 }]);
  const steps = buildPlan(req, computeStats(req)).steps;
  assert.ok(
    steps.filter((s) => s.executeWith).every((s) => /reach Solana/.test(s.risk)),
    "every executable step on an EVM wallet says the funds must reach Solana",
  );
});

check("a Solana wallet is not told to bridge to the chain it is on", () => {
  const req = wallet("solana", [{ symbol: "USDC", amount: 900, usdValue: 900 }]);
  const steps = buildPlan(req, computeStats(req)).steps;
  assert.doesNotMatch(JSON.stringify(steps), /reach Solana/);
});

check("a Solana wallet still gets its plugins", () => {
  // The regression guard for the fix above.
  const req = wallet("solana", [
    { symbol: "USDC", amount: 900, usdValue: 900 },
    { symbol: "SOL", amount: 1, usdValue: 100 },
  ]);
  const steps = buildPlan(req, computeStats(req)).steps;
  assert.match(JSON.stringify(steps), /Kamino/);
  assert.ok(steps.some((s) => s.action.includes("SOL")));
  assert.ok(steps.some((s) => s.executeWith?.includes("PayBox plugin")));
});

check("a mixed wallet keeps the Solana plugins it can use", () => {
  const req = {
    wallets: [
      { chain: "solana" as const, address: "SoLAddr", balances: [{ symbol: "SOL", amount: 1, usdValue: 100 }] },
      { chain: "evm" as const, address: "0xabc", balances: [{ symbol: "ETH", amount: 0.04, usdValue: 100 }] },
    ],
  };
  const steps = buildPlan(req, computeStats(req)).steps;
  assert.match(JSON.stringify(steps), /Jupiter/);
});

console.log("\npickMood() — open positions outrank tidy holdings");

const { pickMood, pickPersona } = await import("../lib/piggy.ts");

const tidy = {
  wallets: [
    {
      chain: "evm" as const,
      address: "0xabc",
      balances: [
        { symbol: "USDC", amount: 800, usdValue: 800 },
        { symbol: "STETH", amount: 0.1, usdValue: 200 },
      ],
    },
  ],
};

check("a tidy wallet with an open bet is not told it is doing nothing silly", () => {
  // vitalik.eth came back a "proud" Stable Queen — "nothing silly" — while the
  // scenario on the same card said gambling.
  const req = { ...tidy, positions: { predictionMarkets: [{ venue: "Polymarket", market: "x", stakeUsd: 500 }] } };
  const stats = computeStats(req);
  const mood = pickMood(stats, pickPersona(req, stats), undefined, [], req.positions);
  assert.notEqual(mood.mood, "proud");
  assert.match(mood.because, /Polymarket/);
  assert.doesNotMatch(mood.because, /nothing silly/);
});

check("an open 25x position makes Piggy unhinged, whatever the holdings say", () => {
  const req = { ...tidy, positions: { perps: [{ venue: "Hyperliquid", symbol: "ETH", notionalUsd: 3675, leverage: 25 }] } };
  const stats = computeStats(req);
  const mood = pickMood(stats, pickPersona(req, stats), undefined, [], req.positions);
  assert.equal(mood.mood, "unhinged");
  assert.match(mood.because, /25x/);
});

check("a tidy wallet with nothing open is still allowed to be praised", () => {
  // The guard against over-correcting: no positions, no accusation.
  const stats = computeStats(tidy);
  const mood = pickMood(stats, pickPersona(tidy, stats), undefined, []);
  assert.equal(mood.mood, "proud");
});

console.log("\nbuildPlan() — urgency and existing positions");

check("leverage leads the plan, not housekeeping", () => {
  const req = { ...tidy, positions: { perps: [{ venue: "Hyperliquid", symbol: "ETH", notionalUsd: 3675, leverage: 25 }] } };
  const steps = buildPlan(req, computeStats(req)).steps;
  assert.match(steps[0].action, /leverage/i);
  assert.match(steps[0].action, /25x/);
});

check("an existing lending position is acknowledged, not nagged over", () => {
  const req = { ...tidy, positions: { lending: [{ venue: "Kamino", asset: "USDC", suppliedUsd: 1200 }] } };
  const steps = buildPlan(req, computeStats(req)).steps;
  const step = steps.find((s) => /Kamino/.test(s.executeWith ?? ""));
  assert.ok(step);
  assert.match(step.action, /already have/);
  assert.doesNotMatch(step.action, /idle stablecoins/);
});

check("an empty wallet is not told to stake what it does not have", () => {
  const empty = { wallets: [{ chain: "evm" as const, address: "0xabc", balances: [] }] };
  const steps = buildPlan(empty, computeStats(empty)).steps;
  assert.doesNotMatch(JSON.stringify(steps), /liquid staking/);
});

console.log("\ncodeMeansContract() — who counts as a person");

const { codeMeansContract } = await import("../lib/address-kind.ts");

check("an empty code answer is an ordinary wallet", () => {
  assert.equal(codeMeansContract("0x"), false);
  assert.equal(codeMeansContract(undefined), false);
  assert.equal(codeMeansContract(null), false);
});

check("a deployed contract is not somebody's wallet", () => {
  // The real USDC bytecode starts this way.
  assert.equal(codeMeansContract("0x60806040526004361061006d5760003557c01"), true);
});

check("an EIP-7702 delegation is still somebody's wallet", () => {
  // Both wallets this was first tested against came back delegated. Treating
  // "has code" as "is a contract" called real people plumbing, and more
  // wallets delegate every week.
  assert.equal(codeMeansContract("0xef01005a7fc11397e9a8ad41bf10bf13f22b0a63f96f6d"), false);
  assert.equal(codeMeansContract("0xef0100612373d7003d694220f7800eeaf8e3924c0951d3"), false);
});

check("something merely starting like a delegation is not one", () => {
  // The indicator is exactly 23 bytes. Anything longer is real bytecode.
  assert.equal(codeMeansContract("0xef01005a7fc11397e9a8ad41bf10bf13f22b0a63f96f6dAABBCC"), true);
  assert.equal(codeMeansContract("0xef0100"), true);
});

if (failures > 0) {
  console.error(`\n${failures} failing`);
  process.exit(1);
}
console.log("\nall passing");
