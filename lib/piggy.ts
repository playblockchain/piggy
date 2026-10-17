import type { HabitReading } from "./history";
import type {
  AnalyzeRequest,
  Band,
  Basis,
  Mood,
  Persona,
  PlanStep,
  Scenario,
  Stats,
  TokenBalance,
  Valued,
} from "./types";

/**
 * Asset classification. Deliberately explicit and editable rather than clever —
 * a mint we do not recognise falls into long-tail, which is the honest default
 * for "Piggy does not know what this is".
 */
const STABLES = new Set(["USDC", "USDT", "PYUSD", "USDS", "DAI", "FDUSD", "USDE"]);
const LIQUID_STAKED = new Set(["JUPSOL", "JITOSOL", "MSOL", "BSOL", "STETH", "WSTETH", "RETH"]);
const MAJORS = new Set(["SOL", "ETH", "WETH", "BTC", "WBTC", "CBBTC"]);

function val<T>(value: T, basis: Basis, source: string): Valued<T> {
  return { value, basis, source };
}

/** Sum of usdValue across balances, or null when the caller priced nothing. */
function pricedTotal(balances: TokenBalance[]): number | null {
  const priced = balances.filter((b) => typeof b.usdValue === "number");
  if (priced.length === 0) return null;
  return priced.reduce((sum, b) => sum + (b.usdValue ?? 0), 0);
}

function shareOf(balances: TokenBalance[], predicate: (b: TokenBalance) => boolean): number | null {
  const total = pricedTotal(balances);
  if (total === null || total === 0) return null;
  const part = balances
    .filter((b) => typeof b.usdValue === "number" && predicate(b))
    .reduce((sum, b) => sum + (b.usdValue ?? 0), 0);
  return part / total;
}

const symbolOf = (b: TokenBalance) => b.symbol.toUpperCase();

export function computeStats(req: AnalyzeRequest): Stats {
  const balances = req.wallets.flatMap((w) => w.balances);
  const source = "PayBox get_portfolio";
  const total = pricedTotal(balances);

  // When nothing is priced, every share is unknown. We do not fall back to
  // token counts — a share of "number of tokens" is not a share of money.
  const unpriced = total === null;
  const share = (p: (b: TokenBalance) => boolean): Valued<number | null> =>
    unpriced
      ? val(null, "unknown", "no USD prices supplied by caller")
      : val(shareOf(balances, p), "observed", source);

  const largest = balances
    .filter((b) => typeof b.usdValue === "number")
    .reduce((max, b) => Math.max(max, b.usdValue ?? 0), 0);

  const gambling = [
    ...(req.positions?.perps ?? []).map((p) => p.notionalUsd),
    ...(req.positions?.predictionMarkets ?? []).map((p) => p.stakeUsd),
  ].filter((n): n is number => typeof n === "number");

  const hasGamblingPlugins =
    (req.positions?.perps?.length ?? 0) > 0 ||
    (req.positions?.predictionMarkets?.length ?? 0) > 0;

  return {
    totalUsd: unpriced
      ? val(null, "unknown", "no USD prices supplied by caller")
      : val(total, "observed", source),
    stableShare: share((b) => STABLES.has(symbolOf(b))),
    stakedShare: share((b) => LIQUID_STAKED.has(symbolOf(b))),
    majorShare: share((b) => MAJORS.has(symbolOf(b))),
    longTailShare: share(
      (b) =>
        !STABLES.has(symbolOf(b)) &&
        !LIQUID_STAKED.has(symbolOf(b)) &&
        !MAJORS.has(symbolOf(b)),
    ),
    concentration:
      unpriced || total === 0
        ? val(null, "unknown", "no USD prices supplied by caller")
        : val(largest / total, "observed", source),
    gamblingExposureUsd: hasGamblingPlugins
      ? gambling.length > 0
        ? val(
            gambling.reduce((a, b) => a + b, 0),
            "observed",
            "PayBox plugin positions",
          )
        : val(null, "unknown", "plugin reported positions without sizes")
      : val(null, "unknown", "no perps or prediction-market plugin data supplied"),
  };
}

/**
 * Anyone can call Piggy, so every wallet must land somewhere sensible. Bands
 * exist so the plan is sized to the wallet: "$10 a week" is patronising to a
 * whale and impossible for an empty wallet.
 */
export function pickBand(stats: Stats): { band: Band; because: string } {
  const total = stats.totalUsd.value;
  if (total === null) {
    return { band: "shrimp", because: "I could not price this, so I am assuming nothing grand." };
  }
  if (total <= 0) return { band: "empty", because: "There is nothing in here at all." };
  if (total < 25) return { band: "dust", because: "Under $25. Barely a snack." };
  if (total < 10000) return { band: "shrimp", because: "Under $10k — my people." };
  if (total < 250000) return { band: "mid", because: "Between $10k and $250k." };
  return { band: "whale", because: "Over $250k. I am being very normal about this." };
}

export function pickPersona(req: AnalyzeRequest, stats: Stats): Persona {
  const longTail = stats.longTailShare.value;
  const stable = stats.stableShare.value;
  const staked = stats.stakedShare.value;
  const major = stats.majorShare.value;
  const total = stats.totalUsd.value;
  const irregular = req.selfReported?.incomeRegularity === "irregular";
  const gambles =
    (req.positions?.perps?.length ?? 0) > 0 ||
    (req.positions?.predictionMarkets?.length ?? 0) > 0;

  // An empty wallet is not an unreadable one. It is the start of the story,
  // and it gets its own card rather than an error.
  if (total !== null && total <= 0) {
    return {
      id: "clean-slate",
      name: "Clean Slate",
      because: "Nothing in here yet. No history to hold against you, which is almost romantic.",
    };
  }

  // Shrimp Gambler is a funding-pattern persona: small balance, irregular
  // top-ups, gambling venues. We only claim it when we have the gambling
  // evidence AND the user told us their income is irregular — otherwise we
  // would be guessing at a story we cannot see from a snapshot.
  if (gambles && irregular && total !== null && total < 2000) {
    return {
      id: "shrimp-gambler",
      name: "Shrimp Gambler",
      because:
        "Small balance, irregular income you told me about, and open positions on gambling venues.",
    };
  }

  if (longTail === null) {
    return {
      id: "unreadable",
      name: "Unreadable (for now)",
      because: "No USD prices were supplied, so I cannot weigh what you hold.",
    };
  }

  if (longTail > 0.5) {
    return {
      id: "delulu-degen",
      name: "Delulu Degen",
      because: `${Math.round(longTail * 100)}% of your balance is in tokens I do not recognise as majors, stables or staked assets.`,
    };
  }
  if ((stable ?? 0) > 0.6) {
    return {
      id: "stable-queen",
      name: "Stable Queen",
      because: `${Math.round((stable ?? 0) * 100)}% of your balance is sitting in stablecoins.`,
    };
  }
  if ((staked ?? 0) + (stable ?? 0) > 0.5) {
    return {
      id: "steady-saver",
      name: "Steady Saver",
      because: "Most of your balance is staked or in stables.",
    };
  }
  return {
    id: "dip-diva",
    name: "Dip Diva",
    because: `${Math.round((major ?? 0) * 100)}% of your balance is in majors.`,
  };
}

export function pickMood(
  stats: Stats,
  persona: Persona,
  habits?: HabitReading,
): { mood: Mood; because: string } {
  const longTail = stats.longTailShare.value;
  const staked = stats.stakedShare.value ?? 0;
  const stable = stats.stableShare.value ?? 0;
  const concentration = stats.concentration.value ?? 0;

  // Habits read from history outrank anything a snapshot can show: what you
  // keep doing says more than what you happen to hold today — unless the
  // wallet is running at machine pace, in which case there is no "you".
  const h = habits && habits.walletKind.kind !== "infrastructure" ? habits : undefined;
  if (h?.raidingSavings.detected) {
    return {
      mood: "sad",
      because: "You keep going back into your own savings. I saw. I write everything down.",
    };
  }
  if (h?.dca.detected && (longTail === null || longTail < 0.5)) {
    return {
      mood: "excited",
      because: "You are buying on a rhythm like a person with a FINANCIAL PLAN. I am obsessed.",
    };
  }

  // Piggy is never neutral — every reading either shames or gushes. The feeling
  // goes here, in his voice; the numbers and the risks stay plain everywhere
  // else. Dramatic, never cruel: sad Piggy is funny, not humiliating, and is
  // always one good move from recovery.
  if (persona.id === "clean-slate") {
    return {
      mood: "curious",
      because: "Empty. No crimes, no triumphs. Put something in and let me judge you properly.",
    };
  }
  if (longTail === null) {
    return {
      mood: "curious",
      because: "I cannot see enough to have a feeling and the not-knowing is EATING me.",
    };
  }
  if (persona.id === "shrimp-gambler" || (longTail > 0.7 && concentration > 0.6)) {
    return {
      mood: "unhinged",
      because: "Nearly everything you own is one bet. One. I have aged years reading this.",
    };
  }
  if (longTail > 0.5) {
    return {
      mood: "sad",
      because: "More than half of this is dog coins, babe. I am lying down about it.",
    };
  }
  if (staked + stable > 0.7 && longTail < 0.1) {
    return {
      mood: "proud",
      because: "Almost every coin working, nothing silly. This is the most attractive thing I have seen.",
    };
  }
  if (staked > 0.3) {
    return {
      mood: "excited",
      because: "You are staking properly and I am NOT normal about it. Look at you.",
    };
  }
  if (staked + stable > 0.5) {
    return {
      mood: "happy",
      because: "Most of your money is working. I could cry. I will not. But I could.",
    };
  }
  return {
    mood: "suspicious",
    because: "This could go either way and we both know which way you are leaning.",
  };
}

/**
 * Which habit Piggy is reacting to. Only habits visible in a snapshot or in
 * plugin positions are ever returned — DCA and raiding savings need
 * transaction history, which PayBox does not provide, so they stay unreachable
 * rather than being guessed at.
 */
export function pickScenario(
  req: AnalyzeRequest,
  stats: Stats,
  habits?: HabitReading,
): { scenario: Scenario; because: string } {
  const longTail = stats.longTailShare.value;
  const staked = stats.stakedShare.value ?? 0;
  const stable = stats.stableShare.value ?? 0;

  // Habits over time first, since they are the harder-won signal. Each
  // `because` repeats what was actually counted rather than asserting intent.
  // Machine-pace wallets get no habit narration at all.
  const h = habits && habits.walletKind.kind !== "infrastructure" ? habits : undefined;
  if (h?.raidingSavings.detected) {
    return { scenario: "raiding_savings", because: h.raidingSavings.measured };
  }
  if (stats.totalUsd.value !== null && stats.totalUsd.value <= 0) {
    return { scenario: "empty_wallet", because: "Nothing to read yet." };
  }
  if ((req.positions?.predictionMarkets?.length ?? 0) > 0) {
    return { scenario: "gambling", because: "You have open prediction-market positions." };
  }
  if ((req.positions?.perps?.length ?? 0) > 0) {
    return { scenario: "perps_leverage", because: "You have open perps positions." };
  }
  if (longTail === null) {
    return { scenario: "unknown", because: "No prices were supplied, so I cannot weigh anything." };
  }
  if (longTail > 0.5) {
    return { scenario: "buying_memecoins", because: "Most of your balance is long-tail tokens." };
  }
  if (h?.dca.detected) {
    return { scenario: "dca_saving", because: h.dca.measured };
  }
  if (staked > 0.3) {
    return { scenario: "staking_yield", because: "A real share of your balance is staked." };
  }
  if (staked + stable > 0.5 && longTail < 0.25) {
    return { scenario: "healthy_portfolio", because: "Spread sensibly, nothing wild." };
  }
  return { scenario: "unknown", because: "Nothing in this snapshot stands out as a habit." };
}

export function buildPlan(req: AnalyzeRequest, stats: Stats): { steps: PlanStep[]; disclaimer: string } {
  const steps: PlanStep[] = [];
  const stable = stats.stableShare.value;
  const staked = stats.stakedShare.value;
  const longTail = stats.longTailShare.value;

  // Every executeWith names a PayBox plugin that can actually act — Kamino
  // (deposit/withdraw), Jupiter (trade/earn) and Sunrise (trade). Read-only
  // plugins are never offered as a way to do something.
  if (stable !== null && stable > 0.4) {
    steps.push({
      action: "Put part of your idle stablecoins to work",
      piggySays: "This cash is just sitting there looking pretty. Give it a job.",
      executeWith: "Kamino Lending Vaults, via your agent's PayBox plugin",
      risk: "Lending carries smart-contract risk and the rate moves. This is not a savings account.",
    });
  }
  if (staked !== null && staked < 0.2) {
    steps.push({
      action: "Move some SOL into liquid staking",
      piggySays: "Staked SOL still moves with SOL. It just stops doing nothing.",
      executeWith: "Jupiter, via your agent's PayBox plugin",
      risk: "You keep full SOL price exposure, and liquid-staking tokens can trade below SOL.",
    });
  }
  if (stats.concentration.value !== null && stats.concentration.value > 0.5) {
    steps.push({
      action: "Spread out the single biggest position",
      piggySays: "One token is carrying your whole personality. That is not a strategy, it is a crush.",
      executeWith: "Jupiter or Sunrise, via your agent's PayBox plugin",
      risk: "Selling crystallises any loss, and the thing you sell may go up afterwards.",
    });
  }
  if (longTail !== null && longTail > 0.4) {
    steps.push({
      action: "Cap the fun money",
      piggySays: "I am not banning the dog coins. I am putting them on a leash.",
      risk: "Capping does not recover what is already down.",
    });
  }
  if (req.goal) {
    steps.push({
      action: `Set aside for: ${req.goal.label}`,
      piggySays: "Name the goal and I will nag you about it. Lovingly.",
      risk: "A goal is a plan, not a guarantee. Markets do not care about your deadline.",
    });
  }
  if (steps.length === 0) {
    steps.push({
      action: "Nothing urgent",
      piggySays: "Honestly? This is fine. I have no notes and it is upsetting.",
      risk: "No action still carries market risk on what you already hold.",
    });
  }

  return {
    steps,
    disclaimer:
      "Piggy is education, not financial advice. Nothing here is a recommendation to buy or sell, " +
      "yields are not guaranteed, and lending and staking can lose money.",
  };
}

/** What Piggy could not see. Shown to the user rather than quietly omitted. */
export function blindSpots(
  req: AnalyzeRequest,
  stats: Stats,
  historyMessage?: string,
  infrastructure?: string,
): string[] {
  const out: string[] = [];
  if (stats.totalUsd.value === null) {
    out.push("No USD prices were supplied, so every share below is unavailable.");
  }
  if (infrastructure) {
    // Say why no habits were narrated, rather than silently reporting none.
    out.push(
      `This is not somebody's wallet, so I did not read habits from it: ${infrastructure} I profile people and the agents working for them, not plumbing.`,
    );
  }
  if (historyMessage) {
    // History could not be read, so habits over time are genuinely unknown.
    out.push(
      `${historyMessage} Without it I cannot tell whether you are saving steadily or raiding your own savings.`,
    );
  }
  if (!req.positions?.perps?.length) {
    out.push("No perps data was supplied, so leverage is unknown.");
  }
  if (!req.positions?.predictionMarkets?.length) {
    out.push("No prediction-market data was supplied, so those bets are unknown.");
  }
  if (!req.selfReported?.incomeRegularity) {
    out.push("You have not told me how regular your income is, which is what I match cohorts on.");
  }
  return out;
}
