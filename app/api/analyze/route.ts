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
  if (!Array.isArray(req.wallets) || req.wallets.length === 0) {
    return {
      ok: false,
      res: badRequest("No wallets were supplied.", "Include at least one wallet: { chain, address, balances[] }."),
    };
  }
  for (const w of req.wallets) {
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
  const req = checked.req;

  const stats = computeStats(req);
  const persona = pickPersona(req, stats);

  // History comes from an indexer, not PayBox. Read the first Solana address;
  // if it is unavailable for any reason, habits stay unknown rather than being
  // inferred from holdings.
  const solanaAddress = req.wallets.find((w) => w.chain === "solana")?.address;
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

  const mood = pickMood(stats, persona, habits);
  const scenario = pickScenario(req, stats, habits);
  const band = pickBand(stats);
  const plan = buildPlan(req, stats);
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
    },
    blindSpots: blindSpots(req, stats, habits ? undefined : historyResult.message),
    cardUrl: `${origin}/card/${token}`,
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
