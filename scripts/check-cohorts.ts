/**
 * Guards data/cohorts.json.
 *
 * Cohort numbers are the one thing in this product a user could not check for
 * themselves, so they are the one thing that must never be invented. This runs
 * as `prebuild`, which means Vercel runs it too: a cohorts file that cannot
 * prove where it came from fails the build instead of reaching a card.
 *
 * An empty cohorts file is always fine. Piggy reports "not available", which
 * is a true statement.
 */

import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "data", "cohorts.json");
const MIN_WALLETS = 30;
/** Words that mean "this did not come from a real measurement". */
const FORBIDDEN_IN_SOURCE = ["fixture", "test", "sample", "example", "dummy", "placeholder"];

const problems: string[] = [];
const fail = (msg: string) => problems.push(msg);

let data: {
  asOf?: unknown;
  source?: unknown;
  cohorts?: unknown;
};

try {
  data = JSON.parse(fs.readFileSync(FILE, "utf8"));
} catch (err) {
  console.error(`check-cohorts: cannot read data/cohorts.json — ${(err as Error).message}`);
  process.exit(1);
}

const cohorts = data.cohorts;
if (!Array.isArray(cohorts)) {
  console.error('check-cohorts: "cohorts" must be an array');
  process.exit(1);
}

if (cohorts.length === 0) {
  console.log("check-cohorts: no cohorts measured yet — fine, Piggy will say so.");
  process.exit(0);
}

// From here on the file claims to hold measurements, so it must prove it.
const asOf = data.asOf;
const source = data.source;

if (typeof asOf !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
  fail('"asOf" must be a YYYY-MM-DD date when cohorts are present — a number without a date is a rumour');
}
if (typeof source !== "string" || source.trim() === "") {
  fail('"source" must say where these numbers came from');
} else {
  const lower = source.toLowerCase();
  const hit = FORBIDDEN_IN_SOURCE.find((w) => lower.includes(w));
  if (hit) fail(`"source" contains "${hit}" — this looks like test data, not a measurement`);
}

cohorts.forEach((raw, i) => {
  const c = raw as Record<string, unknown>;
  const where = `cohort ${i} (${String(c.id ?? "no id")})`;

  if (typeof c.id !== "string" || !c.id) fail(`${where}: missing id`);
  if (typeof c.label !== "string" || !c.label) fail(`${where}: missing label`);

  const n = c.sampleSize;
  if (typeof n !== "number" || !Number.isFinite(n) || n < MIN_WALLETS) {
    fail(`${where}: sampleSize is ${String(n)}, needs at least ${MIN_WALLETS} wallets to mean anything`);
  }

  const outcomes = c.outcomes;
  if (!Array.isArray(outcomes) || outcomes.length === 0) {
    fail(`${where}: no outcomes`);
    return;
  }

  let shareTotal = 0;
  outcomes.forEach((rawO, j) => {
    const o = rawO as Record<string, unknown>;
    const at = `${where} outcome ${j}`;
    if (typeof o.behaviour !== "string" || !o.behaviour) fail(`${at}: missing behaviour`);

    const share = o.shareOfCohort;
    if (typeof share !== "number" || !(share > 0) || share > 1) {
      fail(`${at}: shareOfCohort is ${String(share)}, expected between 0 and 1`);
    } else {
      shareTotal += share;
    }

    const funded = o.stillFundedShare;
    if (typeof funded !== "number" || funded < 0 || funded > 1) {
      fail(`${at}: stillFundedShare is ${String(funded)}, expected 0 to 1`);
    }
  });

  // Every wallet in the cohort must land in exactly one outcome, or the
  // comparison is reporting on a subset while implying the whole group.
  if (Math.abs(shareTotal - 1) > 0.02) {
    fail(`${where}: outcome shares total ${shareTotal.toFixed(3)}, expected 1 — some wallets are unaccounted for`);
  }
});

if (problems.length) {
  console.error("check-cohorts: data/cohorts.json cannot be trusted:\n");
  for (const p of problems) console.error(`  - ${p}`);
  console.error("\nFix it, or empty the cohorts array. Piggy saying nothing beats Piggy making it up.");
  process.exit(1);
}

console.log(`check-cohorts: ${cohorts.length} cohort(s) measured ${String(asOf)}, provenance present.`);
