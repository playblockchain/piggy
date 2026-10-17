/**
 * Is this somebody's wallet, or a piece of plumbing?
 *
 * Piggy profiles people and the agents working for them. On Solana that is
 * enforced by flow shape in `deriveHabits`. On EVM nothing enforced it at all,
 * so dropping in the USDC contract produced "Delulu Degen — buying
 * memecoins", and the burn address produced a $34M "Dip Diva". Both are
 * addresses nobody owns, given a personality and a savings plan.
 *
 * Code is the honest test: an address with bytecode is a contract, not a
 * person's savings. It is one `eth_getCode` per chain and it is definitive,
 * unlike guessing from balances or activity.
 *
 * With one exception that a naive check gets badly wrong. Under EIP-7702 an
 * ordinary wallet can delegate to a smart account, and its code becomes the
 * 23-byte indicator `0xef0100` followed by the delegate's address. That is
 * still somebody's wallet. Both wallets this was first tested against came
 * back delegated, so "has code" alone would have called a large and growing
 * share of real people plumbing.
 */

/** EIP-7702: `0xef0100` || 20-byte delegate. An EOA, not a contract. */
const DELEGATION = /^0xef0100[0-9a-fA-F]{40}$/;

/**
 * What a chain's `eth_getCode` answer means. Pure, so the EIP-7702 case can be
 * tested without a network — which is the case most likely to be got wrong.
 */
export function codeMeansContract(code: string | undefined | null): boolean {
  if (typeof code !== "string" || code.length <= 2) return false;
  return !DELEGATION.test(code);
}

const CHAINS: Array<{ network: string; keyless: string }> = [
  { network: "eth-mainnet", keyless: "https://ethereum-rpc.publicnode.com" },
  { network: "base-mainnet", keyless: "https://mainnet.base.org" },
  { network: "polygon-mainnet", keyless: "https://polygon-bor-rpc.publicnode.com" },
];

/** Addresses used to destroy tokens. Nobody holds the keys. */
const BURN = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
  "0xdead000000000000000042069420694206942069",
]);

export type AddressKind = "wallet" | "contract" | "burn";

export interface KindReading {
  kind: AddressKind;
  /** Why, in Piggy's terms, ready to put on a card. */
  because: string;
}

async function isContractOn(url: string, address: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getCode",
        params: [address, "latest"],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { result?: string };
    return codeMeansContract(body.result);
  } catch {
    // Unreachable chain proves nothing. Saying "wallet" on a failed lookup is
    // the safe direction: it reads the address normally rather than refusing.
    return false;
  }
}

export async function evmAddressKind(address: string): Promise<KindReading> {
  if (BURN.has(address.toLowerCase())) {
    return {
      kind: "burn",
      because:
        "This is a burn address. Everything sent here was thrown away on purpose and nobody has the keys, so there is no one to have a personality.",
    };
  }

  const key = process.env.ALCHEMY_API_KEY;
  const results = await Promise.all(
    CHAINS.map((c) =>
      isContractOn(key ? `https://${c.network}.g.alchemy.com/v2/${key}` : c.keyless, address),
    ),
  );
  const on = CHAINS.filter((_, i) => results[i]).map((c) => c.network.replace("-mainnet", ""));

  return on.length > 0
    ? {
        kind: "contract",
        because: `This address is a contract on ${on.join(" and ")}, not somebody's wallet. I read what it holds, but a contract has no income, no habits and nothing to be ashamed of. I profile people and the agents working for them, not plumbing.`,
      }
    : { kind: "wallet", because: "" };
}
