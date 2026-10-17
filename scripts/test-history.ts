/**
 * Fixture tests for deriveHabits.
 *
 * The live Helius call cannot be verified without an API key, so the pure
 * transform is tested against hand-built fixtures shaped like the documented
 * response. Run with: npm run test:history
 */

import assert from "node:assert/strict";
import { deriveHabits, type ParsedTx } from "../lib/history.ts";

const ME = "MyWalletAddress1111111111111111111111111111";
const THEM = "SomeoneElse1111111111111111111111111111111";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const JITO = "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn";

const DAY = 86400;
const T0 = 1_760_000_000;

const deposit = (dayOffset: number, amount: number): ParsedTx => ({
  type: "TRANSFER",
  timestamp: T0 + dayOffset * DAY,
  tokenTransfers: [
    { fromUserAccount: THEM, toUserAccount: ME, mint: USDC, tokenAmount: amount },
  ],
});

const swap = (dayOffset: number): ParsedTx => ({
  type: "SWAP",
  timestamp: T0 + dayOffset * DAY,
  tokenTransfers: [],
});

const sendAway = (dayOffset: number, mint: string, amount: number): ParsedTx => ({
  type: "TRANSFER",
  timestamp: T0 + dayOffset * DAY,
  tokenTransfers: [
    { fromUserAccount: ME, toUserAccount: THEM, mint, tokenAmount: amount },
  ],
});

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${(err as Error).message.split("\n")[0]}`);
  }
}

console.log("deriveHabits");

check("counts inbound USDC deposits and their median", () => {
  const h = deriveHabits(ME, [deposit(0, 100), deposit(14, 200), deposit(28, 300)]);
  assert.equal(h.funding.depositCount, 3);
  assert.equal(h.funding.medianDepositUsdc, 200);
});

check("calls evenly spaced deposits regular", () => {
  const h = deriveHabits(ME, [deposit(0, 100), deposit(14, 100), deposit(28, 100), deposit(42, 100)]);
  assert.equal(h.funding.regularity, "regular");
});

check("calls lumpy deposits irregular", () => {
  const h = deriveHabits(ME, [deposit(0, 500), deposit(3, 500), deposit(120, 500)]);
  assert.equal(h.funding.regularity, "irregular");
});

check("leaves regularity unknown below three deposits", () => {
  const h = deriveHabits(ME, [deposit(0, 100), deposit(30, 100)]);
  assert.equal(h.funding.regularity, "unknown");
});

check("ignores outbound USDC when counting deposits", () => {
  const h = deriveHabits(ME, [deposit(0, 100), sendAway(5, USDC, 50)]);
  assert.equal(h.funding.depositCount, 1);
});

check("detects DCA from evenly spaced swaps over enough weeks", () => {
  const h = deriveHabits(ME, [swap(0), swap(7), swap(14), swap(21), swap(28)]);
  assert.equal(h.dca.detected, true);
});

check("does not call three swaps in one week a rhythm", () => {
  const h = deriveHabits(ME, [swap(0), swap(1), swap(2)]);
  assert.equal(h.dca.detected, false);
});

check("does not call erratic swaps DCA", () => {
  const h = deriveHabits(ME, [swap(0), swap(2), swap(60), swap(61)]);
  assert.equal(h.dca.detected, false);
});

check("detects stablecoins leaving the wallet twice", () => {
  const h = deriveHabits(ME, [sendAway(1, USDC, 40), sendAway(9, USDC, 60)]);
  assert.equal(h.raidingSavings.detected, true);
});

check("counts staked assets leaving as raiding too", () => {
  const h = deriveHabits(ME, [sendAway(1, JITO, 1), sendAway(9, JITO, 1)]);
  assert.equal(h.raidingSavings.detected, true);
});

check("one withdrawal is not raiding", () => {
  const h = deriveHabits(ME, [sendAway(1, USDC, 40)]);
  assert.equal(h.raidingSavings.detected, false);
});

check("empty history asserts nothing", () => {
  const h = deriveHabits(ME, []);
  assert.equal(h.funding.depositCount, 0);
  assert.equal(h.funding.regularity, "unknown");
  assert.equal(h.dca.detected, false);
  assert.equal(h.raidingSavings.detected, false);
});

check("tolerates transactions missing fields entirely", () => {
  const h = deriveHabits(ME, [{}, { tokenTransfers: [{}] }, { type: "SWAP" }]);
  assert.equal(h.funding.depositCount, 0);
  assert.equal(h.dca.detected, false);
});

if (failures > 0) {
  console.error(`\n${failures} failing`);
  process.exit(1);
}
console.log("\nall passing");
