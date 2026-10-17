-- Lil Piggy cohorts — ONE self-contained query.
--
-- Paste into Dune and run. Export the result as CSV, then:
--     npm run import:cohorts -- ~/Downloads/results.csv
-- which writes data/cohorts.json and turns "wallets like yours" on.
--
-- What it does: groups wallets by HOW MONEY ARRIVES, then reports what happened
-- to EVERY wallet in each group. Selecting on funding and reporting all
-- outcomes is what stops this being a survivors' highlight reel.
--
-- Schema checked against Dune docs on 17 Oct 2026:
--   tokens_solana.transfers      — from_owner, to_owner, token_mint_address, amount_usd, block_time
--   dex_solana.trades            — trader_id, tx_id, amount_usd, token_bought_symbol, block_time
--   solana_utils.latest_balances — token_balance_owner, sol_balance, token_balance, token_mint_address
-- Still unverified: the USDC mint constant below. Check it before trusting a
-- result — a wrong mint returns an empty table that looks like a finding.
--
-- Tuning: if the final table comes back empty, the sample is too small. Widen
-- the window first, then lower the `HAVING COUNT(*) >= 30` floor — but never
-- below ~30, or the shares stop meaning anything.

-- WHO IS IN THE SAMPLE (the ICP, as observable filters)
--
-- Piggy compares you to people like you, so the sample has to BE people like
-- you. Defined behaviourally, because how someone handles money is what makes
-- them the audience — not which on-ramp they happened to use:
--
--   * small money      — $50 to $10k arriving in the window, so no whales
--   * Solana DeFi user — actually traded on a Solana DEX in the window
--   * recently active  — 6 months by default; set window_start 3 months back
--                        for a tighter read
--   * not a bot        — deposit and trade counts capped below machine rates
--
-- Not filtered on: arriving via MoonPay or PayBox specifically. That would
-- need their settlement addresses identified in a labelled dataset, which is
-- not confirmed — check Dune's label tables before adding it. Nothing in this
-- query assumes it.

WITH params AS (
  SELECT
    DATE '2026-04-01' AS window_start,   -- 6 months; use 2026-07-01 for 3
    DATE '2026-10-01' AS window_end,
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' AS usdc_mint
),

-- 1. Inbound USDC only: the clearest "money came in" signal, and it needs no
--    pricing because USDC is already dollars.
deposits AS (
  SELECT
    t.to_owner   AS wallet,
    t.block_time,
    t.amount_usd AS usd_in
  FROM tokens_solana.transfers t, params p
  WHERE t.token_mint_address = p.usdc_mint
    AND t.block_time >= p.window_start
    AND t.block_time <  p.window_end
    AND t.to_owner IS NOT NULL
    AND t.to_owner <> t.from_owner
    AND t.amount_usd BETWEEN 10 AND 20000
),

-- 2. The funding signature: cadence and size of arrivals.
funding AS (
  SELECT
    wallet,
    COUNT(*)      AS deposit_count,
    SUM(usd_in)   AS total_in_usd,
    STDDEV_POP(DATE_DIFF('day', DATE '2026-04-01', CAST(block_time AS DATE))) AS gap_stddev
  FROM deposits
  GROUP BY wallet
  HAVING COUNT(*) BETWEEN 2 AND 60
     AND SUM(usd_in) BETWEEN 50 AND 10000
),

-- 2b. ICP gate: must actually be a Solana DeFi user in the window, and must
--     not trade at machine rates. Without this the sample is "anyone who
--     received USDC", which is not the audience.
defi_active AS (
  SELECT
    t.trader_id AS wallet,
    COUNT(DISTINCT t.tx_id) AS trade_count
  FROM dex_solana.trades t, params p
  WHERE t.block_time >= p.window_start
    AND t.block_time <  p.window_end
    AND t.trader_id IN (SELECT wallet FROM funding)
  GROUP BY t.trader_id
  HAVING COUNT(DISTINCT t.tx_id) BETWEEN 1 AND 500
),

cohort AS (
  SELECT
    f.wallet,
    f.total_in_usd,
    CASE
      WHEN f.deposit_count <= 6  AND f.gap_stddev >  20 THEN 'irregular_topup'
      WHEN f.deposit_count >= 12 AND f.gap_stddev <= 12 THEN 'regular_topup'
      ELSE 'mixed'
    END AS funding_signature
  FROM funding f
  JOIN defi_active d ON d.wallet = f.wallet
),

-- 3. What each wallet did. Classified by what it bought, not by decoding
--    instruction layouts — cheap, and enough to tell habits apart.
activity AS (
  SELECT
    c.wallet,
    c.funding_signature,
    MAX(CASE WHEN t.token_bought_symbol IN ('JUPSOL','JITOSOL','MSOL','BSOL') THEN 1 ELSE 0 END) AS touched_staking,
    MAX(CASE WHEN t.token_bought_symbol IN ('USDC','USDT','PYUSD')            THEN 1 ELSE 0 END) AS moved_to_stables,
    COUNT(DISTINCT t.tx_id) AS trade_count
  FROM cohort c
  LEFT JOIN dex_solana.trades t
    ON t.trader_id = c.wallet
   AND t.block_time >= DATE '2026-04-01'
   AND t.block_time <  DATE '2026-10-01'
  GROUP BY c.wallet, c.funding_signature
),

classified AS (
  SELECT
    wallet,
    funding_signature,
    CASE
      WHEN touched_staking = 1 AND trade_count < 40 THEN 'staked_and_sat'
      WHEN trade_count >= 200                       THEN 'overtraded'
      WHEN moved_to_stables = 1                     THEN 'held_stables'
      ELSE 'other'
    END AS behaviour
  FROM activity
),

-- 4. Survival, in token units. Deliberately not a return figure: real P&L needs
--    historical prices per token per timestamp and a way to separate deposits
--    from gains. "Did the money last" is cheap, honest, and the better story.
ending AS (
  SELECT
    b.token_balance_owner AS wallet,
    MAX(b.sol_balance)    AS sol_balance,
    SUM(CASE WHEN b.token_mint_address = (SELECT usdc_mint FROM params)
             THEN b.token_balance ELSE 0 END) AS usdc_balance
  FROM solana_utils.latest_balances b
  WHERE b.token_balance_owner IN (SELECT wallet FROM cohort)
  GROUP BY b.token_balance_owner
)

SELECT
  c.funding_signature,
  c.behaviour,
  COUNT(*) AS wallets,
  ROUND(
    AVG(CASE
          WHEN COALESCE(e.usdc_balance, 0) >= 25 OR COALESCE(e.sol_balance, 0) >= 0.15
          THEN 1.0 ELSE 0.0
        END), 3
  ) AS still_funded_share
FROM classified c
LEFT JOIN ending e ON e.wallet = c.wallet
GROUP BY c.funding_signature, c.behaviour
HAVING COUNT(*) >= 30
ORDER BY c.funding_signature, wallets DESC
