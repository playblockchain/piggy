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
  /** Tokens kept but carried unpriced because the quote was not credible. */
  pricesRejected?: number;
  /** Set when the wallet was too large to finish reading. */
  partialRead?: string;
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
 * This used to apply only to unpriced tokens, on the reasoning that a market
 * price made a token real enough to report. It does not: anyone can seed a
 * pool and quote a price for a token nobody can sell. A symbol that is a sales
 * pitch is an advert whatever price is attached to it.
 *
 * An odd ticker still survives — the test is whether the symbol is
 * advertising, not whether we recognise it. DRAW, CHICKENMATE and yukinoki
 * stay, as honestly unpriced long-tail dust.
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
  const kept = balances.filter((b) => !looksLikeAdvert(b.symbol));
  return { balances: kept, advertsIgnored: balances.length - kept.length };
}

/** The assets whose price can be taken at face value. */
const TRUSTED = new Set([
  "USDC", "USDT", "PYUSD", "USDS", "DAI", "FDUSD", "USDE",
  "JUPSOL", "JITOSOL", "MSOL", "BSOL", "STETH", "WSTETH", "RETH",
  "SOL", "ETH", "WETH", "BTC", "WBTC", "CBBTC", "MATIC", "POL",
]);

/**
 * A price nobody could sell at is not a price.
 *
 * An unsellable airdrop quoted at $1.16M turned a normal wallet into an
 * "unhinged whale" — one manipulated pool deciding the band, the persona and
 * the mood. Anyone can seed a pool; the quote means nothing until someone
 * exits at it.
 *
 * So when a single unrecognised token claims to be worth more than twenty
 * times everything else in the wallet combined, its price is dropped and the
 * token is carried as unpriced. The token is NOT removed — it is really
 * there, and Piggy reports it as something it could not value rather than
 * deleting a holding or repeating a number it does not believe.
 */
function rejectImplausiblePrices(balances: FetchedBalance[]): {
  balances: FetchedBalance[];
  pricesRejected: number;
} {
  let pricesRejected = 0;
  const out = balances.map((b) => {
    const value = b.usdValue;
    if (value === undefined || TRUSTED.has(b.symbol.toUpperCase())) return b;
    const others = balances
      .filter((o) => o !== b && typeof o.usdValue === "number")
      .reduce((sum, o) => sum + (o.usdValue ?? 0), 0);
    // A lone token in an otherwise unpriced wallet has nothing to be measured
    // against, so the rule needs something real to compare with.
    if (others <= 0 || value <= others * 20) return b;
    pricesRejected += 1;
    const { usdValue: _dropped, ...rest } = b;
    return rest;
  });
  return { balances: out, pricesRejected };
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

/**
 * Real symbols for mints we do not hardcode.
 *
 * Without this, anything outside the handful of mints below showed as the
 * first six characters of its address — BONK read as "DezXAZ", which looks
 * like Piggy failed rather than like a token. Names come from Helius's asset
 * metadata, the same place a wallet UI gets them.
 *
 * Failure here is cosmetic and must never cost the read, so anything that
 * goes wrong leaves the short mint in place.
 */
async function nameSolanaMints(key: string | undefined, mints: string[]): Promise<Record<string, string>> {
  if (!key || mints.length === 0) return {};
  try {
    const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAssetBatch",
        params: { ids: mints.slice(0, 1000) },
      }),
    });
    if (!res.ok) return {};
    const body = (await res.json()) as {
      result?: Array<{ id?: string; content?: { metadata?: { symbol?: string; name?: string } } }>;
    };
    const out: Record<string, string> = {};
    for (const asset of body.result ?? []) {
      const meta = asset?.content?.metadata;
      const symbol = (meta?.symbol || meta?.name || "").trim();
      if (asset?.id && symbol) out[asset.id] = symbol;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * The same read through Helius DAS, for wallets the parsed form cannot survive.
 *
 * `getTokenAccountsByOwner` returns every token account a wallet has ever been
 * given, including the empty ones. Airdrop farming means real wallets hold
 * tens of thousands, and the response then exceeds Node's maximum string
 * length — so a wallet holding 34 SOL was refused outright with "Cannot
 * create a string longer than 0x1fffffe8 characters".
 *
 * DAS is paginated and skips zero balances, so it cannot blow up the same way.
 * The wallet above has five assets with anything in them; the rest are empty
 * accounts. It also carries decimals, symbols and prices, which is why the
 * values here are used as-is rather than re-priced.
 */
async function fetchSolanaViaDas(
  address: string,
  key: string,
): Promise<{ balances: FetchedBalance[]; partial?: string }> {
  const out: FetchedBalance[] = [];
  // Five pages is far more than any readable wallet; it bounds a pathological
  // one rather than paging for ever.
  for (let page = 1; page <= 5; page += 1) {
    let res: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 400 * attempt));
      res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getAssetsByOwner",
          params: {
            ownerAddress: address,
            page,
            limit: 1000,
            displayOptions: { showFungible: true, showZeroBalance: false },
          },
        }),
      });
      if (res.ok) break;
    }
    if (!res) throw new Error("the asset index could not be reached");
    if (!res.ok) {
      if (page === 1) throw new Error(`asset page 1 returned ${res.status}`);
      return { balances: out, partial: partialNote(out.length) };
    }
    const body = (await res.json()) as {
      result?: {
        items?: Array<{
          id?: string;
          content?: { metadata?: { symbol?: string; name?: string } };
          token_info?: {
            balance?: number;
            decimals?: number;
            symbol?: string;
            price_info?: { total_price?: number; price_per_token?: number };
          };
        }>;
      };
    };
    // A failed page must not quietly shorten the wallet. The same wallet read
    // as 968 tokens once and as 1 the next time, with nothing saying which was
    // true. Helius times out paging the most extreme wallets, so what is read
    // is kept and the gap is reported rather than hidden or refused.
    const items = body.result?.items;
    if (!items) {
      if (page === 1) throw new Error("the asset index would not answer for this address");
      return { balances: out, partial: partialNote(out.length) };
    }
    for (const item of items) {
      const info = item.token_info;
      if (!info || !item.id) continue;
      const decimals = info.decimals ?? 0;
      const amount = (info.balance ?? 0) / 10 ** decimals;
      if (!(amount > 0)) continue;
      const price = info.price_info?.price_per_token;
      const usdValue =
        typeof info.price_info?.total_price === "number"
          ? info.price_info.total_price
          : typeof price === "number"
            ? amount * price
            : undefined;
      out.push({
        symbol: SOLANA_MINTS[item.id] ?? info.symbol ?? item.content?.metadata?.symbol ?? item.id.slice(0, 6),
        assetId: item.id,
        amount,
        ...(usdValue !== undefined ? { usdValue } : {}),
      });
    }
    // A full page means there is probably another. Running out of pages is
    // itself a truncation and has to be said, or the cap silently becomes the
    // answer.
    if (items.length < 1000) return { balances: out };
  }
  return { balances: out, partial: partialNote(out.length) };
}

/** Said on the card when a wallet is too large for the index to finish. */
const partialNote = (read: number) =>
  `This wallet holds so many tokens that the asset index timed out part-way. I read the first ${read.toLocaleString()} and everything below is based on those, so treat the total as a floor rather than the whole picture.`;

export async function fetchSolanaWallet(address: string): Promise<WalletFetch> {
  const key = process.env.HELIUS_API_KEY;
  const url = key
    ? `https://mainnet.helius-rpc.com/?api-key=${key}`
    : "https://api.mainnet-beta.solana.com";

  try {
    const lamports = (await rpc(url, "getBalance", [address])) as { value?: number };

    const raw: Array<{ mint: string; amount: number }> = [];
    let partialRead: string | undefined;
    try {
      const accounts = (await rpc(url, "getTokenAccountsByOwner", [
        address,
        { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
        { encoding: "jsonParsed" },
      ])) as {
        value?: Array<{
          account: { data: { parsed: { info: { mint: string; tokenAmount: { uiAmount: number | null } } } } };
        }>;
      };
      for (const acc of accounts?.value ?? []) {
        const info = acc.account.data.parsed.info;
        const amount = info.tokenAmount.uiAmount ?? 0;
        if (amount > 0) raw.push({ mint: info.mint, amount });
      }
    } catch (err) {
      // Too many token accounts for the parsed response. DAS pages and skips
      // the empty ones, so a real wallet is read instead of refused. The
      // holdings rejoin the normal path below so the native SOL balance, the
      // pricing and the dust filter all still apply — an early return here
      // dropped 34 SOL on the floor.
      if (!key) throw err;
      const das = await fetchSolanaViaDas(address, key);
      partialRead = das.partial;
      for (const b of das.balances) {
        raw.push({ mint: b.assetId, amount: b.amount });
      }
    }
    const sol = (lamports?.value ?? 0) / 1e9;
    if (sol > 0) raw.push({ mint: SOL_MINT, amount: sol });

    if (raw.length === 0) {
      return { ok: true, chain: "solana", address, balances: [] };
    }

    const unknown = raw.filter((r) => !SOLANA_MINTS[r.mint]).map((r) => r.mint);
    const [prices, names] = await Promise.all([
      priceSolanaMints(raw.map((r) => r.mint)),
      nameSolanaMints(key, unknown),
    ]);
    const balances: FetchedBalance[] = raw.map((r) => {
      const price = prices[r.mint];
      return {
        // A mint with no name anywhere keeps its address, which the scoring
        // treats as long-tail — the honest default for "I do not know this".
        symbol: SOLANA_MINTS[r.mint] ?? names[r.mint] ?? r.mint.slice(0, 6),
        assetId: r.mint,
        amount: r.amount,
        ...(typeof price === "number" ? { usdValue: r.amount * price } : {}),
      };
    });

    // Dust below a cent is noise, and it drags the long-tail share around.
    const meaningful = balances.filter((b) => (b.usdValue ?? 0) >= 0.01 || b.usdValue === undefined);
    const cleaned = dropAdverts(meaningful);
    const checked = rejectImplausiblePrices(cleaned.balances);
    return {
      ok: true,
      chain: "solana",
      address,
      balances: checked.balances,
      ...(cleaned.advertsIgnored ? { advertsIgnored: cleaned.advertsIgnored } : {}),
      ...(checked.pricesRejected ? { pricesRejected: checked.pricesRejected } : {}),
      ...(partialRead ? { partialRead } : {}),
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
  const checked = rejectImplausiblePrices(cleaned.balances);
  return {
    ok: true,
    chain: "evm",
    address,
    balances: checked.balances,
    ...(cleaned.advertsIgnored ? { advertsIgnored: cleaned.advertsIgnored } : {}),
    ...(checked.pricesRejected ? { pricesRejected: checked.pricesRejected } : {}),
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
