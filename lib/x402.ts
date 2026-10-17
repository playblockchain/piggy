import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { x402ResourceServer } from "@x402/next";

/**
 * PayBox pays x402 with "a plain EOA payer", so Piggy advertises an EVM rail.
 * Default is Base Sepolia for testing; set X402_NETWORK=eip155:8453 for Base
 * mainnet once a real payment is wanted.
 */
export const X402_NETWORK = (process.env.X402_NETWORK ??
  "eip155:84532") as `${string}:${string}`;
export const X402_PRICE = process.env.X402_PRICE ?? "$0.02";

/** Where payment lands. Must be set before the service can charge anyone. */
export const PAY_TO = process.env.X402_PAY_TO ?? "";

const facilitatorClient = new HTTPFacilitatorClient({
  url: process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator",
});

export const resourceServer = new x402ResourceServer(facilitatorClient).register(
  X402_NETWORK,
  new ExactEvmScheme(),
);

/** Keyed by path so x402 discovery advertises the right route template. */
export const analyzeRouteConfig = {
  "/api/analyze": {
    accepts: [
      {
        scheme: "exact" as const,
        price: X402_PRICE,
        network: X402_NETWORK,
        payTo: PAY_TO,
      },
    ],
    description:
      "Piggy reads a wallet snapshot and returns a money personality, a mood, and a plan.",
  },
};
