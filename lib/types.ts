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

/** The seven expressions from the brand sheet. */
export type Mood =
  | "happy"
  | "excited"
  | "proud"
  | "curious"
  | "suspicious"
  | "sad"
  | "unhinged";

/**
 * The habit scenarios from the brand sheet. Five are readable from a snapshot
 * plus plugin positions; `dca_saving` and `raiding_savings` are habits over
 * time, so they stay unreachable until Piggy reads transaction history.
 */
export type Scenario =
  | "dca_saving"
  | "staking_yield"
  | "healthy_portfolio"
  | "buying_memecoins"
  | "perps_leverage"
  | "gambling"
  | "raiding_savings"
  | "empty_wallet"
  | "unknown";

/**
 * Size band. Piggy is built for shrimps, but anyone can call it, so a whale
 * must still get a sensible answer rather than advice to save $10 a week.
 * Bands match queries/strategies.sql so a card can honestly say which band a
 * strategy actually worked in.
 */
export type Band = "empty" | "dust" | "shrimp" | "mid" | "whale";

export type PersonaId =
  | "clean-slate"
  | "stable-queen"
  | "steady-saver"
  | "dip-diva"
  | "delulu-degen"
  | "shrimp-gambler"
  | "unreadable";

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
  /** The habit Piggy is reacting to, and whether it was readable at all. */
  scenario: { scenario: Scenario; because: string };
  /** Size band, so the plan is sized to the wallet rather than to an assumption. */
  band: { band: Band; because: string };
  /**
   * What reading transaction history found, or why it could not. Separate from
   * `stats` because it comes from an indexer, not from PayBox.
   */
  history: {
    status: string;
    message?: string;
    funding?: { depositCount: number; medianDepositUsdc: number | null; regularity: string; measured: string };
    dca?: { detected: boolean; measured: string };
    raidingSavings?: { detected: boolean; measured: string };
    walletKind?: { kind: string; because: string };
  };
  stats: Stats;
  plan: { steps: PlanStep[]; disclaimer: string };
  cohort: CohortReading;
  /** What Piggy could not see, stated plainly rather than guessed. */
  blindSpots: string[];
  cardUrl: string;
}
