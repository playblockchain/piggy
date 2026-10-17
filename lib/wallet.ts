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
  /** Airdropped adverts left out of `balances` — reported, never silent. */
  advertsIgnored?: number;
}

/**
 * Airdropped adverts, not holdings.
 *
 * Reading the whole wallet surfaced what the narrow Base read never did: of
 * flexcopy.eth's 67 "tokens", most were spam airdrops whose symbol is a sales
 * pitch — "Visit https://… to claim airdrop", a Telegram link, or USDC spelled
 * with a Cyrillic С to impersonate the real one. Counting those as assets
 * overstates what someone holds, and printing them repeats a phishing lure
 * back to the person being phished.
 *
 * Only unpriced tokens are tested: if a market prices it, it is real enough to
 * report whatever it is called. An odd ticker survives too — the test is
 * whether the symbol is advertising, not whether we recognise it. So DRAW,
 * CHICKENMATE and yukinoki stay, as honestly unpriced long-tail dust.
 */
const ADVERT =
  /https?:|www\.|t\.me|\.(?:com|xyz|io|net|org|app|me|link|site|pro|vip|top|fi|so|finance)\b|claim|airdrop|redeem|voucher|reward|visit /i;

function looksLikeAdvert(symbol: string): boolean {
  const s = symbol.trim();
  // Real tickers are short, single-word and Latin.
  if (s.length > 16 || /\s/.test(s)) return true;
  if (ADVERT.test(s)) return true;
  // Cyrillic or Greek letters inside an otherwise Latin ticker is impersonation.
  return /[Ѐ-ӿͰ-Ͽ]/.test(s);
}

/** Drops advert tokens, returning what is left and how many went. */
function dropAdverts(balances: FetchedBalance[]): {
  balances: FetchedBalance[];
  advertsIgnored: number;
} {
  const kept = balances.filter((b) => b.usdValue !== undefined || !looksLikeAdvert(b.symbol));
  return { balances: kept, advertsIgnored: balances.length - kept.length };
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
    const cleaned = dropAdverts(meaningful);
    return {
      ok: true,
      chain: "solana",
      address,
      balances: cleaned.balances,
      ...(cleaned.advertsIgnored ? { advertsIgnored: cleaned.advertsIgnored } : {}),
    };
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

/** Native asset per network, since the portfolio API leaves its symbol null. */
const NATIVE: Record<string, string> = {
  "eth-mainnet": "ETH",
  "base-mainnet": "ETH",
  "matic-mainnet": "MATIC",
  "polygon-mainnet": "MATIC",
};

/**
 * All EVM holdings across Ethereum, Base and Polygon in one call, with
 * metadata and prices.
 *
 * The first version read only USDC and ETH on Base, which meant an active
 * Ethereum wallet came back as "Unreadable" with one token — the holdings
 * were not wrong so much as barely looked at.
 */
async function fetchEvmPortfolio(address: string, key: string): Promise<WalletFetch> {
  const res = await fetch(`https://api.g.alchemy.com/data/v1/${key}/assets/tokens/by-address`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      addresses: [{ address, networks: ["eth-mainnet", "base-mainnet", "polygon-mainnet"] }],
      withMetadata: true,
      withPrices: true,
    }),
  });
  if (!res.ok) throw new Error(`portfolio returned ${res.status}`);

  const body = (await res.json()) as {
    data?: {
      tokens?: Array<{
        network?: string;
        tokenAddress?: string | null;
        tokenBalance?: string;
        tokenMetadata?: { symbol?: string | null; decimals?: number | null };
        tokenPrices?: Array<{ value?: string }>;
      }>;
    };
  };

  const balances: FetchedBalance[] = [];
  for (const t of body.data?.tokens ?? []) {
    const decimals = t.tokenMetadata?.decimals ?? 18;
    const raw = t.tokenBalance ?? "0x0";
    let amount = 0;
    try {
      amount = Number(BigInt(raw)) / 10 ** decimals;
    } catch {
      continue;
    }
    if (!(amount > 0)) continue;

    const price = Number(t.tokenPrices?.[0]?.value);
    const symbol =
      t.tokenMetadata?.symbol ?? (t.tokenAddress ? t.tokenAddress.slice(0, 6) : NATIVE[t.network ?? ""] ?? "native");
    const usdValue = Number.isFinite(price) ? amount * price : undefined;

    // Dust distorts the long-tail share without telling anyone anything.
    if (usdValue !== undefined && usdValue < 0.01) continue;
    balances.push({
      symbol,
      assetId: t.tokenAddress ?? `native:${t.network}`,
      amount,
      ...(usdValue !== undefined ? { usdValue } : {}),
    });
  }

  const cleaned = dropAdverts(balances);
  return {
    ok: true,
    chain: "evm",
    address,
    balances: cleaned.balances,
    ...(cleaned.advertsIgnored ? { advertsIgnored: cleaned.advertsIgnored } : {}),
  };
}

export async function fetchEvmWallet(address: string): Promise<WalletFetch> {
  const key = process.env.ALCHEMY_API_KEY;
  if (key) {
    try {
      return await fetchEvmPortfolio(address, key);
    } catch {
      // Fall through to the keyless Base read rather than returning nothing.
    }
  }
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
