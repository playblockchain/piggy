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

if (failures > 0) {
  console.error(`\n${failures} failing`);
  process.exit(1);
}
console.log("\nall passing");
