/**
 * Piggy's wire contract.
 *
 * The calling agent assembles everything here from PayBox: balances come from
 * `get_portfolio`, and `positions` comes from whichever PayBox plugins the user
 * has enabled (Aave, World, Hyperliquid, Kamino...). Piggy never holds wallet
 * authority and never executes — it reads what it is given and answers.
 */

/** Where a value came from. Every number Piggy shows carries one of these. */
export type Basis = "observed" | "inferred" | "self-reported" | "unknown";

export interface Valued<T> {
  value: T;
  basis: Basis;
  /** Human-readable source, e.g. "PayBox get_portfolio" or "user-supplied". */
  source: string;
}

export interface TokenBalance {
  symbol: string;
  /** Solana mint or EVM contract address, when the caller knows it. */
  assetId?: string;
  amount: number;
  /** Omit when the caller has no price. Piggy will not invent one. */
  usdValue?: number;
}

export interface WalletSnapshot {
  chain: "solana" | "evm";
  address: string;
  balances: TokenBalance[];
}

/** Positions the agent fetched from enabled PayBox plugins. All optional. */
export interface PluginPositions {
  /** e.g. Hyperliquid, Drift, Jupiter Perps. */
  perps?: Array<{ venue: string; symbol: string; notionalUsd?: number; leverage?: number }>;
  /** e.g. the World prediction-markets plugin. */
  predictionMarkets?: Array<{ venue: string; market: string; stakeUsd?: number }>;
  /** e.g. Aave, Kamino. */
  lending?: Array<{ venue: string; asset: string; suppliedUsd?: number; borrowedUsd?: number }>;
}

export interface AnalyzeRequest {
  wallets: WalletSnapshot[];
  positions?: PluginPositions;
  goal?: { label: string; targetUsd?: number; horizonMonths?: number };
  selfReported?: {
    monthlyIncomeUsd?: number;
    incomeRegularity?: "regular" | "irregular";
    /** How much of a loss they can stomach, in their own words. */
    riskAppetite?: "low" | "medium" | "high";
  };
}

export type Mood = "proud" | "okay" | "sad" | "unhinged";

export type PersonaId =
  | "stable-queen"
  | "steady-saver"
  | "dip-diva"
  | "delulu-degen"
  | "shrimp-gambler";

export interface Persona {
  id: PersonaId;
  name: string;
  /** Why Piggy called them this — in terms of what was actually observed. */
  because: string;
}

export interface Stats {
  totalUsd: Valued<number | null>;
  stableShare: Valued<number | null>;
  stakedShare: Valued<number | null>;
  majorShare: Valued<number | null>;
  longTailShare: Valued<number | null>;
  concentration: Valued<number | null>;
  gamblingExposureUsd: Valued<number | null>;
}

export interface PlanStep {
  action: string;
  /** Piggy in voice. Never a promise about returns. */
  piggySays: string;
  /** What the agent would call to carry this out, for the user's own decision. */
  executeWith?: string;
  risk: string;
}

export interface CohortReading {
  status: "ok" | "unavailable";
  /** Present only when status is "ok". */
  cohortId?: string;
  label?: string;
  /** Plain-language note about what this cohort is and is not. */
  note: string;
  sampleSize?: number;
  asOf?: string;
  source?: string;
  outcomes?: Array<{ behaviour: string; shareOfCohort: number; stillFundedShare: number }>;
}

export interface AnalyzeResponse {
  asOf: string;
  persona: Persona;
  mood: { mood: Mood; because: string };
  stats: Stats;
  plan: { steps: PlanStep[]; disclaimer: string };
  cohort: CohortReading;
  /** What Piggy could not see, stated plainly rather than guessed. */
  blindSpots: string[];
  cardUrl: string;
}
