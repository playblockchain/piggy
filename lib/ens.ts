import { keccak256 } from "js-sha3";

/**
 * ENS resolution.
 *
 * People paste names, not hex. Without this, "flexcopy.eth" was rejected as
 * "not a Solana or EVM address" — which looks like the product being broken
 * rather than a missing feature.
 *
 * Resolved on-chain through the ENS registry rather than a third-party
 * resolver API, so the answer comes from the same place the name does.
 */

const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
/** resolver(bytes32) */
const RESOLVER_SELECTOR = "0178b8bf";
/** addr(bytes32) */
const ADDR_SELECTOR = "3b3b57de";
const ZERO = "0x0000000000000000000000000000000000000000";

export const isEnsName = (value: string) => /^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/i.test(value.trim());

/** ENS namehash, per EIP-137. */
export function namehash(name: string): string {
  let node = "00".repeat(32);
  if (name) {
    for (const label of name.toLowerCase().split(".").reverse()) {
      node = keccak256(Buffer.from(node + keccak256(label), "hex"));
    }
  }
  return `0x${node}`;
}

async function call(url: string, to: string, data: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
    });
    const body = (await res.json()) as { result?: string; error?: unknown };
    return body.error || typeof body.result !== "string" ? null : body.result;
  } catch {
    return null;
  }
}

const addressFromWord = (word: string | null): string | null => {
  if (!word || word.length < 66) return null;
  const addr = `0x${word.slice(-40)}`;
  return addr.toLowerCase() === ZERO ? null : addr;
};

export async function resolveEns(name: string): Promise<string | null> {
  const key = process.env.ALCHEMY_API_KEY;
  const url = key
    ? `https://eth-mainnet.g.alchemy.com/v2/${key}`
    : "https://ethereum-rpc.publicnode.com";

  const node = namehash(name.trim()).slice(2);

  const resolver = addressFromWord(await call(url, ENS_REGISTRY, `0x${RESOLVER_SELECTOR}${node}`));
  if (!resolver) return null;

  return addressFromWord(await call(url, resolver, `0x${ADDR_SELECTOR}${node}`));
}
