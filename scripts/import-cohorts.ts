/**
 * Turns a Dune CSV export of queries/cohorts.sql into data/cohorts.json.
 *
 *     npm run import:cohorts -- ~/Downloads/results.csv
 *
 * Refuses to write anything it cannot stand behind: missing columns, shares
 * outside 0–1, or cohorts too small to mean anything. An empty cohorts file is
 * a fine outcome — Piggy reports "not available" and says so. A plausible-looking
 * file built from bad input is not.
 */

import fs from "node:fs";
import path from "node:path";

const MIN_COHORT_WALLETS = 30;
/**
 * An outcome measured on a handful of wallets is not a finding. One wallet
 * that ran out of money becomes "0% still funded", which reads as a law of
 * nature. Anything under this is merged into a single aggregate bucket so the
 * shares still total 1 without any tiny-sample claim being shown.
 */
const MIN_OUTCOME_WALLETS = 10;

interface Row {
  funding_signature: string;
  behaviour: string;
  wallets: number;
  still_funded_share: number;
}

/** Minimal CSV reader: handles quoted fields and embedded commas. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const SIGNATURES: Record<string, { label: string; match: Record<string, unknown> }> = {
  irregular_topup: {
    label: "Irregular top-ups",
    match: { incomeRegularity: "irregular" },
  },
  regular_topup: {
    label: "Regular top-ups",
    match: { incomeRegularity: "regular" },
  },
  // Deliberately last and unconstrained: it is the catch-all, and readCohort
  // takes the first match, so the specific ones must be tried first.
  mixed: { label: "Mixed funding", match: {} },
};

const BEHAVIOUR_LABEL: Record<string, string> = {
  held_steady: "held steady",
  raided_savings: "took money back out of savings",
  bought_on_a_rhythm: "bought on a rhythm",
  overtraded: "traded constantly",
  staked_and_sat: "staked it and left it alone",
  held_stables: "kept it in stablecoins",
  other: "did something else",
};

/** Keeps every wallet accounted for while refusing to report tiny samples. */
function buildOutcomes(rows: Row[], sampleSize: number) {
  const big = rows.filter((r) => r.wallets >= MIN_OUTCOME_WALLETS);
  const small = rows.filter((r) => r.wallets < MIN_OUTCOME_WALLETS);

  const outcomes = big.map((r) => ({
    behaviour: BEHAVIOUR_LABEL[r.behaviour] ?? r.behaviour,
    shareOfCohort: Number((r.wallets / sampleSize).toFixed(3)),
    stillFundedShare: r.still_funded_share,
  }));

  if (small.length > 0) {
    const wallets = small.reduce((sum, r) => sum + r.wallets, 0);
    // Weighted so the aggregate is a real average, not an average of averages.
    const funded = small.reduce((sum, r) => sum + r.still_funded_share * r.wallets, 0);
    outcomes.push({
      behaviour: "everything else, too few each to report separately",
      shareOfCohort: Number((wallets / sampleSize).toFixed(3)),
      stillFundedShare: Number((funded / wallets).toFixed(3)),
    });
  }

  return outcomes.sort((a, b) => b.shareOfCohort - a.shareOfCohort);
}

function fail(message: string): never {
  console.error(`import-cohorts: ${message}`);
  process.exit(1);
}

/**
 * `--out <path>` writes somewhere other than data/cohorts.json. Tests must use
 * it: a test run that can reach the real data file is how invented fixture
 * numbers end up on a card presented as measured fact.
 */
const argv = process.argv.slice(2);
const outFlag = argv.indexOf("--out");
const outPath =
  outFlag !== -1 ? argv[outFlag + 1] : path.join(process.cwd(), "data", "cohorts.json");
if (outFlag !== -1 && !argv[outFlag + 1]) fail("--out needs a path");
// Only skip the value after --out when the flag is actually present;
// otherwise outFlag is -1 and this would drop argv[0], the CSV itself.
const sourceFlag = argv.indexOf("--source");
/** Where the numbers actually came from. Wrong provenance is worse than none. */
const sourceLabel = sourceFlag !== -1 ? argv[sourceFlag + 1] : "";
if (sourceFlag !== -1 && !argv[sourceFlag + 1]) fail("--source needs a description");

const skip = new Set<number>();
if (outFlag !== -1) skip.add(outFlag).add(outFlag + 1);
if (sourceFlag !== -1) skip.add(sourceFlag).add(sourceFlag + 1);
const csvPath = argv.filter((_, i) => !skip.has(i))[0];

if (!csvPath) fail("pass the Dune CSV, e.g. npm run import:cohorts -- ~/Downloads/results.csv");
if (!fs.existsSync(csvPath)) fail(`no file at ${csvPath}`);

const table = parseCsv(fs.readFileSync(csvPath, "utf8"));
if (table.length < 2) fail("the CSV has no data rows");

const header = table[0].map((h) => h.trim().toLowerCase());
const required = ["funding_signature", "behaviour", "wallets", "still_funded_share"];
for (const col of required) {
  if (!header.includes(col)) fail(`the CSV is missing the "${col}" column`);
}
const idx = (name: string) => header.indexOf(name);

const rows: Row[] = table.slice(1).map((cells, i) => {
  const wallets = Number(cells[idx("wallets")]);
  const share = Number(cells[idx("still_funded_share")]);
  if (!Number.isFinite(wallets) || wallets <= 0) fail(`row ${i + 2}: "wallets" is not a positive number`);
  if (!Number.isFinite(share) || share < 0 || share > 1) {
    fail(`row ${i + 2}: "still_funded_share" is ${cells[idx("still_funded_share")]}, expected 0–1`);
  }
  return {
    funding_signature: cells[idx("funding_signature")].trim(),
    behaviour: cells[idx("behaviour")].trim(),
    wallets,
    still_funded_share: share,
  };
});

const unknown = rows.map((r) => r.funding_signature).filter((s) => !(s in SIGNATURES));
if (unknown.length) fail(`unrecognised funding signatures: ${[...new Set(unknown)].join(", ")}`);

const cohorts = Object.entries(SIGNATURES)
  .map(([id, meta]) => {
    const mine = rows.filter((r) => r.funding_signature === id);
    if (mine.length === 0) return null;
    const sampleSize = mine.reduce((sum, r) => sum + r.wallets, 0);
    if (sampleSize < MIN_COHORT_WALLETS) {
      console.warn(
        `  skipping "${id}": ${sampleSize} wallets is under the ${MIN_COHORT_WALLETS} floor`,
      );
      return null;
    }
    return {
      id,
      label: meta.label,
      match: meta.match,
      sampleSize,
      outcomes: buildOutcomes(mine, sampleSize),
    };
  })
  .filter((c): c is NonNullable<typeof c> => c !== null);

if (cohorts.length === 0) fail("nothing survived the checks, so cohorts.json was left alone");

const out = {
  $comment:
    "Generated by scripts/import-cohorts.ts from a Dune export of queries/cohorts.sql. Do not hand-edit the numbers.",
  schemaVersion: 1,
  asOf: new Date().toISOString().slice(0, 10),
  source:
    sourceLabel ||
    `unspecified pipeline · imported from ${path.basename(csvPath)}`,
  method:
    "Wallets are grouped by funding signature (how money arrives), then outcomes are reported for every wallet in the group, not only the ones that did well. Survival means the wallet still held meaningful USDC or SOL at the end of the window — it is not a return figure.",
  cohorts,
};

fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);

console.log(`import-cohorts: wrote ${cohorts.length} cohort(s) to ${outPath}`);
for (const c of cohorts) {
  console.log(`  ${c.label}: ${c.sampleSize} wallets, ${c.outcomes.length} outcome(s)`);
}
