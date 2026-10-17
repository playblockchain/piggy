import { saveCard } from "./card-store.ts";
import { encodeCard, type CardPayload } from "./card-token.ts";
import { readCohort } from "./cohorts.ts";
import {
  blindSpots,
  buildPlan,
  computeStats,
  pickBand,
  pickMood,
  pickPersona,
  pickScenario,
} from "./piggy.ts";
import { deriveHabits, fetchHistory } from "./history.ts";
import { deriveEvmHabits, fetchEvmHistory } from "./evm-history.ts";
import { fetchPositions } from "./positions.ts";
import { isEnsName, resolveEns } from "./ens.ts";
import { fetchWallet } from "./wallet.ts";
import { evmAddressKind, type KindReading } from "./address-kind.ts";
import type { AnalyzeRequest, AnalyzeResponse } from "./types.ts";

/**
 * Everything the paid endpoint does, minus HTTP and payment.
 *
 * This used to live inside the route handler, which meant the only way to
 * exercise it was to make a $0.02 call — so the offline tools grew their own
 * copy of the same steps, and a copy drifts. Auditing a copy proves nothing
 * about what callers are charged for. The route, the dry run and the audit
 * now run this one function.
 */

export type AnalyzeOutcome =
  | { ok: false; error: string; fix: string }
  | { ok: true; response: AnalyzeResponse; cardPayload: CardPayload };

export interface AnalyzeOptions {
  /** Where card links point. */
  origin: string;
  /**
   * Whether to write the card to blob storage for a short link. Offline tools
   * pass false so an audit of a hundred wallets does not litter the store.
   */
  persistCard?: boolean;
}

export async function analyze(
  request: AnalyzeRequest,
  { origin, persistCard = true }: AnalyzeOptions,
): Promise<AnalyzeOutcome> {
  let req = request;

  // Addresses supplied: go and read them, rather than trusting a balance list
  // the caller typed.
  const resolved: AnalyzeResponse["resolved"] = [];
  const callerSuppliedBalances = (req.wallets ?? []).length > 0;
  const readChains = new Set<"solana" | "evm">();
  let advertsIgnored = 0;
  let pricesRejected = 0;
  const partialReads: string[] = [];

  if (req.addresses?.length) {
    // People paste names. Resolve them before anything else looks at them.
    const inputs = req.addresses.slice(0, 5);
    const addresses = await Promise.all(
      inputs.map(async (a) => (isEnsName(a) ? ((await resolveEns(a)) ?? a) : a)),
    );
    req = { ...req, addresses };
    const fetched = await Promise.all(addresses.map((a) => fetchWallet(a)));
    for (const f of fetched) {
      if (f.ok) readChains.add(f.chain);
      advertsIgnored += f.advertsIgnored ?? 0;
      pricesRejected += f.pricesRejected ?? 0;
      if (f.partialRead) partialReads.push(f.partialRead);
      resolved.push({
        address: f.address,
        chain: f.chain,
        ok: f.ok,
        tokens: f.balances.length,
        ...(f.advertsIgnored ? { advertsIgnored: f.advertsIgnored } : {}),
        ...(f.message ? { message: f.message } : {}),
      });
    }
    req = {
      ...req,
      wallets: [
        ...(req.wallets ?? []),
        ...fetched
          .filter((f) => f.ok)
          .map((f) => ({ chain: f.chain, address: f.address, balances: f.balances })),
      ],
    };

    // Not one address could be read, and the caller sent no balances either.
    // This used to fall through to an empty wallet and return a Clean Slate
    // card — so a typo bought a cheerful verdict about a wallet that does not
    // exist, for real money. Failing here means x402 never settles.
    if (!callerSuppliedBalances && fetched.every((f) => !f.ok)) {
      const reasons = fetched.map((f) => `${f.address}: ${f.message ?? "could not be read"}`);
      return {
        ok: false,
        error:
          fetched.length === 1
            ? `I could not read that address. ${reasons[0]}`
            : `I could not read any of those addresses. ${reasons.join(" ")}`,
        fix: "Check the address, or send `wallets` with balances you already have. Nothing was charged for this.",
      };
    }
  }

  // Is this somebody's wallet at all? A contract has no income and no habits,
  // and giving one a money personality is the product being wrong out loud.
  let notAWallet: KindReading | undefined;
  const evmAddresses = (req.addresses ?? []).filter((a) => /^0x[a-fA-F0-9]{40}$/.test(a));
  const hasSolana = (req.wallets ?? []).some((w) => w.chain === "solana");
  if (evmAddresses.length > 0 && !hasSolana) {
    const kinds = await Promise.all(evmAddresses.map((a) => evmAddressKind(a)));
    // Only when every address given is plumbing. One contract alongside a real
    // wallet should not stop Piggy reading the person.
    if (kinds.every((k) => k.kind !== "wallet")) notAWallet = kinds[0];
  }

  // Positions are not balances: a leveraged bet lives at a venue, so Piggy
  // asks the venues directly rather than inferring from holdings.
  let positionsChecked: Awaited<ReturnType<typeof fetchPositions>>["checked"] = [];
  if (req.addresses?.length) {
    const found = await fetchPositions(req.addresses);
    positionsChecked = found.checked;
    if (found.perps.length > 0 || found.predictionMarkets.length > 0) {
      req = {
        ...req,
        positions: {
          ...(req.positions ?? {}),
          perps: [...(req.positions?.perps ?? []), ...found.perps],
          predictionMarkets: [
            ...(req.positions?.predictionMarkets ?? []),
            ...found.predictionMarkets,
          ],
        },
      };
    }
  }

  // EVM history: the six months of behaviour behind the holdings.
  let evmHistory: AnalyzeResponse["evmHistory"];
  let perpsHistory: Array<{ venue: string; interactions: number; firstAt: string; lastAt: string }> =
    [];
  const firstEvm = (req.addresses ?? []).find((a) => /^0x[a-fA-F0-9]{40}$/.test(a));
  if (firstEvm) {
    const hist = await fetchEvmHistory(firstEvm);
    if (hist.status === "ok") {
      const habits = deriveEvmHabits(firstEvm, hist.transfers);
      evmHistory = {
        status: "ok",
        funding: habits.funding,
        topCounterparties: habits.topCounterparties,
        ...(habits.venueUse.length ? { venueUse: habits.venueUse } : {}),
        ...(hist.chains ? { chains: hist.chains } : {}),
      };

      // Past use of a perps venue is behaviour, but it is NOT an open
      // position. Writing it into positions.perps made Piggy say "size down
      // the open perps" about trades closed two months ago. It travels as its
      // own signal so the two claims stay separate.
      perpsHistory = habits.venueUse.filter((v) => v.kind === "perps");
    } else {
      evmHistory = { status: hist.status, message: hist.message };
    }
  }

  // Name the real source. These numbers stopped coming from PayBox the moment
  // Piggy started reading addresses itself.
  const sources: string[] = [];
  if (readChains.has("evm")) sources.push("Alchemy (Ethereum, Base, Polygon)");
  if (readChains.has("solana")) sources.push("Helius and Jupiter (Solana)");
  if (callerSuppliedBalances) sources.push("balances supplied by the caller");
  const stats = computeStats(req, sources.join(" + ") || "balances supplied by the caller");
  const persona = notAWallet
    ? {
        id: "not-a-wallet" as const,
        name: notAWallet.kind === "burn" ? "The Void" : "Not Somebody's Wallet",
        because: notAWallet.because,
      }
    : pickPersona(req, stats);

  // History comes from an indexer, not PayBox. Read the first Solana address;
  // if it is unavailable for any reason, habits stay unknown rather than being
  // inferred from holdings.
  const solanaAddress = (req.wallets ?? []).find((w) => w.chain === "solana")?.address;
  const historyResult = solanaAddress
    ? await fetchHistory(solanaAddress)
    : {
        status: "unsupported_chain" as const,
        transactions: [],
        message: "No Solana address was supplied, so I could not read transaction history.",
      };
  const habits =
    historyResult.status === "ok"
      ? deriveHabits(solanaAddress as string, historyResult.transactions)
      : undefined;

  const mood = notAWallet
    ? ({ mood: "curious", because: notAWallet.because } as ReturnType<typeof pickMood>)
    : pickMood(stats, persona, habits, perpsHistory, req.positions);
  const scenario = notAWallet
    ? ({
        scenario: "unknown",
        because:
          "A contract does not have habits. What it holds is real; what it means is nobody's behaviour.",
      } as ReturnType<typeof pickScenario>)
    : pickScenario(req, stats, habits, perpsHistory);
  const band = pickBand(stats);
  const plan = notAWallet
    ? {
        steps: [
          {
            action: "Nothing for me to do here",
            piggySays:
              "I cannot nag a contract. Give me an address somebody actually owns and I will be unbearable about it.",
            risk: "No action, and nothing here belongs to you unless you deployed it.",
          },
        ],
        disclaimer: buildPlan(req, stats, perpsHistory).disclaimer,
      }
    : buildPlan(req, stats, perpsHistory);
  const cohort = readCohort(req, stats);
  const asOf = new Date().toISOString();

  const cardPayload: CardPayload = {
    persona,
    mood,
    stats: {
      stableShare: stats.stableShare.value,
      stakedShare: stats.stakedShare.value,
      longTailShare: stats.longTailShare.value,
      majorShare: stats.majorShare.value,
      totalKnown: stats.totalUsd.value !== null,
    },
    cohort: { status: cohort.status, label: cohort.label, note: cohort.note },
    // The card carries the lead action and the money at risk, so the thing
    // people actually share says what to do and what is on the line.
    ...(plan.steps[0]
      ? { firstStep: { action: plan.steps[0].action, piggySays: plan.steps[0].piggySays } }
      : {}),
    ...(typeof stats.gamblingExposureUsd.value === "number"
      ? { exposureUsd: stats.gamblingExposureUsd.value }
      : {}),
    asOf,
    band: band.band,
    scenario: scenario.scenario,
  };
  const token = encodeCard(cardPayload);

  // Short link when storage is available, long self-contained link otherwise.
  // A storage hiccup must never cost someone their card.
  const shortId = persistCard ? await saveCard(cardPayload) : null;
  const cardPath = shortId ? `/c/${shortId}` : `/card/${token}`;

  const response: AnalyzeResponse = {
    asOf,
    persona,
    mood,
    scenario,
    band,
    stats,
    plan,
    cohort,
    history: {
      status: historyResult.status,
      message: historyResult.message,
      funding: habits?.funding,
      dca: habits?.dca,
      raidingSavings: habits?.raidingSavings,
      walletKind: habits?.walletKind,
    },
    ...(resolved.length ? { resolved } : {}),
    ...(positionsChecked.length ? { venuesChecked: positionsChecked } : {}),
    ...(evmHistory ? { evmHistory } : {}),
    blindSpots: blindSpots(
      req,
      stats,
      habits ? undefined : historyResult.message,
      habits?.walletKind.kind === "infrastructure" ? habits.walletKind.because : undefined,
      positionsChecked.filter((v) => v.ok).map((v) => v.venue),
      advertsIgnored,
      pricesRejected,
    ).concat(partialReads, notAWallet ? [notAWallet.because] : []),
    cardUrl: `${origin}${cardPath}`,
    cardImageUrl: `${origin}${cardPath}/opengraph-image`,
  };

  return { ok: true, response, cardPayload };
}
