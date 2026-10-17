import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { encodeCard } from "@/lib/card-token";
import { readCohort } from "@/lib/cohorts";
import {
  blindSpots,
  buildPlan,
  computeStats,
  pickMood,
  pickBand,
  pickPersona,
  pickScenario,
} from "@/lib/piggy";
import { deriveHabits, fetchHistory } from "@/lib/history";
import { deriveEvmHabits, fetchEvmHistory } from "@/lib/evm-history";
import { fetchPositions } from "@/lib/positions";
import { isEnsName, resolveEns } from "@/lib/ens";
import { fetchWallet } from "@/lib/wallet";
import { analyzeRouteConfig, PAY_TO, resourceServer } from "@/lib/x402";
import type { AnalyzeRequest, AnalyzeResponse } from "@/lib/types";

/** Specific failures, never a generic "something went wrong". */
function badRequest(message: string, fix: string) {
  return NextResponse.json({ error: message, fix }, { status: 400 });
}

function validate(body: unknown): { ok: true; req: AnalyzeRequest } | { ok: false; res: NextResponse } {
  if (!body || typeof body !== "object") {
    return { ok: false, res: badRequest("Body was not a JSON object.", "POST a JSON object with a `wallets` array.") };
  }
  const req = body as Partial<AnalyzeRequest>;
  const hasAddresses = Array.isArray(req.addresses) && req.addresses.length > 0;
  const hasWallets = Array.isArray(req.wallets) && req.wallets.length > 0;
  if (!hasAddresses && !hasWallets) {
    return {
      ok: false,
      res: badRequest(
        "No wallets or addresses were supplied.",
        'Send either { "addresses": ["<wallet address>"] } and Piggy will fetch the balances, or { "wallets": [{ chain, address, balances[] }] } if you already have them.',
      ),
    };
  }
  for (const w of req.wallets ?? []) {
    if (!w || typeof w.address !== "string" || !Array.isArray(w.balances)) {
      return {
        ok: false,
        res: badRequest("A wallet entry was malformed.", "Each wallet needs an `address` string and a `balances` array."),
      };
    }
  }
  return { ok: true, req: req as AnalyzeRequest };
}

const handler = async (request: NextRequest) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body was not valid JSON.", "Send a JSON body with Content-Type: application/json.");
  }

  const checked = validate(body);
  if (!checked.ok) return checked.res;
  let req = checked.req;

  // Addresses supplied: go and read them, rather than trusting a balance list
  // the caller typed.
  const resolved: AnalyzeResponse["resolved"] = [];
  if (req.addresses?.length) {
    // People paste names. Resolve them before anything else looks at them.
    const inputs = req.addresses.slice(0, 5);
    const addresses = await Promise.all(
      inputs.map(async (a) => (isEnsName(a) ? ((await resolveEns(a)) ?? a) : a)),
    );
    req = { ...req, addresses };
    const fetched = await Promise.all(addresses.map((a) => fetchWallet(a)));
    for (const f of fetched) {
      resolved.push({
        address: f.address,
        chain: f.chain,
        ok: f.ok,
        tokens: f.balances.length,
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
          predictionMarkets: [...(req.positions?.predictionMarkets ?? []), ...found.predictionMarkets],
        },
      };
    }
  }

  // EVM history: the six months of behaviour behind the holdings.
  let evmHistory: AnalyzeResponse["evmHistory"];
  let perpsHistory: Array<{ venue: string; interactions: number; firstAt: string; lastAt: string }> = [];
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

  const stats = computeStats(req);
  const persona = pickPersona(req, stats);

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

  const mood = pickMood(stats, persona, habits, perpsHistory);
  const scenario = pickScenario(req, stats, habits, perpsHistory);
  const band = pickBand(stats);
  const plan = buildPlan(req, stats, perpsHistory);
  const cohort = readCohort(req, stats);
  const asOf = new Date().toISOString();

  const origin = process.env.NEXT_PUBLIC_BASE_URL ?? request.nextUrl.origin;
  const token = encodeCard({
    persona,
    mood,
    stats: {
      stableShare: stats.stableShare.value,
      stakedShare: stats.stakedShare.value,
      longTailShare: stats.longTailShare.value,
      totalKnown: stats.totalUsd.value !== null,
    },
    cohort: { status: cohort.status, label: cohort.label, note: cohort.note },
    asOf,
    band: band.band,
    scenario: scenario.scenario,
  });

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
    ),
    cardUrl: `${origin}/card/${token}`,
    cardImageUrl: `${origin}/card/${token}/opengraph-image`,
  };

  return NextResponse.json(response);
};

/**
 * Payment is only settled on a successful response, which is why this uses the
 * route wrapper rather than the proxy: a malformed request should not be
 * charged for.
 *
 * Without X402_PAY_TO there is nowhere to send payment, so the service runs
 * free and says so rather than pretending to charge.
 */
export const POST = PAY_TO
  ? withX402(handler, analyzeRouteConfig, resourceServer)
  : handler;
