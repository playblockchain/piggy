/**
 * Read a wallet from nothing but its address.
 *
 * Before this, a caller had to hand Piggy a balance list, which meant the
 * answer was only ever as good as what the caller typed. Now you can drop in
 * any address — your own, one PayBox connected, or a stranger's — and Piggy
 * goes and looks.
 *
 * Classification works off MINT, not a token list: the handful of assets that
 * change the verdict are named below, and anything unrecognised is long-tail,
 * which is both the honest default and exactly how the scoring already treats
 * an unknown symbol.
 */

export interface FetchedBalance {
  symbol: string;
  assetId: string;
  amount: number;
  usdValue?: number;
}

export interface WalletFetch {
  ok: boolean;
  chain: "solana" | "evm";
  address: string;
  balances: FetchedBalance[];
  /** Specific reason when ok is false. */
  message?: string;
}

/** The assets that change a verdict. Everything else is long-tail on purpose. */
const SOLANA_MINTS: Record<string, string> = {
  So11111111111111111111111111111111111111112: "SOL",
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: "JITOSOL",
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: "MSOL",
  jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v: "JUPSOL",
  bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1: "BSOL",
};

const SOL_MINT = "So11111111111111111111111111111111111111112";

/** Base mainnet, the two assets worth reading without an indexer. */
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const isEvm = (a: string) => /^0x[a-fA-F0-9]{40}$/.test(a);
/** Solana addresses are base58 and never contain 0, O, I or l. */
const isSolana = (a: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);

export function detectChain(address: string): "solana" | "evm" | null {
  if (isEvm(address)) return "evm";
  if (isSolana(address)) return "solana";
  return null;
}

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`${method} returned ${res.status}`);
  const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message ?? `${method} failed`);
  return body.result;
}

/** Jupiter's free price endpoint. Unpriced assets stay unpriced — never guessed. */
async function priceSolanaMints(mints: string[]): Promise<Record<string, number>> {
  if (mints.length === 0) return {};
  const out: Record<string, number> = {};
  // Chunked so one very long URL cannot fail the whole lookup.
  for (let i = 0; i < mints.length; i += 40) {
    const chunk = mints.slice(i, i + 40);
    try {
      const res = await fetch(`https://lite-api.jup.ag/price/v3?ids=${chunk.join(",")}`);
      if (!res.ok) continue;
      const body = (await res.json()) as Record<string, { usdPrice?: number }>;
      for (const [mint, info] of Object.entries(body)) {
        if (typeof info?.usdPrice === "number") out[mint] = info.usdPrice;
      }
    } catch {
      // A failed price chunk means those assets stay unpriced, which Piggy
      // reports honestly rather than filling in.
    }
  }
  return out;
}

export async function fetchSolanaWallet(address: string): Promise<WalletFetch> {
  const key = process.env.HELIUS_API_KEY;
  const url = key
    ? `https://mainnet.helius-rpc.com/?api-key=${key}`
    : "https://api.mainnet-beta.solana.com";

  try {
    const [accounts, lamports] = await Promise.all([
      rpc(url, "getTokenAccountsByOwner", [
        address,
        { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
        { encoding: "jsonParsed" },
      ]) as Promise<{
        value?: Array<{
          account: { data: { parsed: { info: { mint: string; tokenAmount: { uiAmount: number | null } } } } };
        }>;
      }>,
      rpc(url, "getBalance", [address]) as Promise<{ value?: number }>,
    ]);

    const raw: Array<{ mint: string; amount: number }> = [];
    for (const acc of accounts?.value ?? []) {
      const info = acc.account.data.parsed.info;
      const amount = info.tokenAmount.uiAmount ?? 0;
      if (amount > 0) raw.push({ mint: info.mint, amount });
    }
    const sol = (lamports?.value ?? 0) / 1e9;
    if (sol > 0) raw.push({ mint: SOL_MINT, amount: sol });

    if (raw.length === 0) {
      return { ok: true, chain: "solana", address, balances: [] };
    }

    const prices = await priceSolanaMints(raw.map((r) => r.mint));
    const balances: FetchedBalance[] = raw.map((r) => {
      const price = prices[r.mint];
      return {
        // An unrecognised mint keeps its address as the symbol, which the
        // scoring treats as long-tail — the honest default.
        symbol: SOLANA_MINTS[r.mint] ?? r.mint.slice(0, 6),
        assetId: r.mint,
        amount: r.amount,
        ...(typeof price === "number" ? { usdValue: r.amount * price } : {}),
      };
    });

    // Dust below a cent is noise, and it drags the long-tail share around.
    const meaningful = balances.filter((b) => (b.usdValue ?? 0) >= 0.01 || b.usdValue === undefined);
    return { ok: true, chain: "solana", address, balances: meaningful };
  } catch (err) {
    return {
      ok: false,
      chain: "solana",
      address,
      balances: [],
      message: `Could not read that Solana address: ${(err as Error).message}`,
    };
  }
}

export async function fetchEvmWallet(address: string): Promise<WalletFetch> {
  const url = "https://mainnet.base.org";
  try {
    const padded = address.slice(2).toLowerCase().padStart(64, "0");
    const [usdcHex, ethHex] = await Promise.all([
      rpc(url, "eth_call", [
        { to: BASE_USDC, data: `0x70a08231${padded}` },
        "latest",
      ]) as Promise<string>,
      rpc(url, "eth_getBalance", [address, "latest"]) as Promise<string>,
    ]);

    const balances: FetchedBalance[] = [];
    const usdc = Number(BigInt(usdcHex)) / 1e6;
    if (usdc > 0.01) balances.push({ symbol: "USDC", assetId: BASE_USDC, amount: usdc, usdValue: usdc });
    const eth = Number(BigInt(ethHex)) / 1e18;
    // ETH is left unpriced rather than hardcoded: a wrong price is worse than
    // an honest gap, and the scoring handles unpriced assets already.
    if (eth > 0) balances.push({ symbol: "ETH", assetId: "native", amount: eth });

    return { ok: true, chain: "evm", address, balances };
  } catch (err) {
    return {
      ok: false,
      chain: "evm",
      address,
      balances: [],
      message: `Could not read that EVM address: ${(err as Error).message}`,
    };
  }
}

export async function fetchWallet(address: string): Promise<WalletFetch> {
  const chain = detectChain(address);
  if (chain === "solana") return fetchSolanaWallet(address);
  if (chain === "evm") return fetchEvmWallet(address);
  return {
    ok: false,
    chain: "solana",
    address,
    balances: [],
    message: "That does not look like a Solana or EVM address.",
  };
}
