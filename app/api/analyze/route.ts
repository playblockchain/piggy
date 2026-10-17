import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { analyze } from "@/lib/analyze";
import { analyzeRouteConfig, PAY_TO, resourceServer } from "@/lib/x402";
import type { AnalyzeRequest } from "@/lib/types";

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

/**
 * HTTP and payment only. Everything Piggy actually decides lives in
 * `lib/analyze.ts`, so the offline tools exercise the same code a caller pays
 * for rather than a copy of it that can drift.
 */
const handler = async (request: NextRequest) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body was not valid JSON.", "Send a JSON body with Content-Type: application/json.");
  }

  const checked = validate(body);
  if (!checked.ok) return checked.res;

  const origin = process.env.NEXT_PUBLIC_BASE_URL ?? request.nextUrl.origin;
  const outcome = await analyze(checked.req, { origin });
  if (!outcome.ok) return badRequest(outcome.error, outcome.fix);

  return NextResponse.json(outcome.response);
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
