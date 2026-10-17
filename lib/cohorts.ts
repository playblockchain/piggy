import cohortData from "../data/cohorts.json";
import type { AnalyzeRequest, CohortReading, Stats } from "./types";

/**
 * A cohort groups wallets by *funding signature* — how money arrives — and then
 * reports what happened to all of them. Selecting on funding rather than on
 * returns is what stops this being a survivors' highlight reel.
 *
 * The cache in data/cohorts.json ships empty. Until it is filled from real
 * queries, every reading is "unavailable". That is a legitimate answer; an
 * invented comparison is not.
 */

interface CachedCohort {
  id: string;
  label: string;
  match: {
    incomeRegularity?: "regular" | "irregular";
    maxTotalUsd?: number;
    requiresGamblingVenues?: boolean;
  };
  sampleSize: number;
  outcomes: Array<{ behaviour: string; shareOfCohort: number; stillFundedShare: number }>;
}

interface CohortFile {
  asOf: string | null;
  source: string | null;
  method: string;
  cohorts: CachedCohort[];
}

const file = cohortData as unknown as CohortFile;

export function readCohort(req: AnalyzeRequest, stats: Stats): CohortReading {
  if (!file.cohorts.length || !file.asOf || !file.source) {
    return {
      status: "unavailable",
      note:
        "No cohort data has been measured yet, so I cannot tell you what wallets like yours did. " +
        "I would rather say that than make it up.",
    };
  }

  const gambles =
    (req.positions?.perps?.length ?? 0) > 0 ||
    (req.positions?.predictionMarkets?.length ?? 0) > 0;
  const total = stats.totalUsd.value;

  const match = file.cohorts.find((c) => {
    if (c.match.incomeRegularity && c.match.incomeRegularity !== req.selfReported?.incomeRegularity) {
      return false;
    }
    if (c.match.maxTotalUsd !== undefined && (total === null || total > c.match.maxTotalUsd)) {
      return false;
    }
    if (c.match.requiresGamblingVenues && !gambles) return false;
    return true;
  });

  if (!match) {
    return {
      status: "unavailable",
      note:
        "You do not fall into any cohort that has been measured, so there is nothing honest to compare you against.",
    };
  }

  return {
    status: "ok",
    cohortId: match.id,
    label: match.label,
    sampleSize: match.sampleSize,
    asOf: file.asOf,
    source: file.source,
    outcomes: match.outcomes,
    note:
      `Based on ${match.sampleSize} wallets grouped by how their money arrived, measured as of ${file.asOf}. ` +
      "These are past outcomes for other wallets. They are not a forecast for yours.",
  };
}
