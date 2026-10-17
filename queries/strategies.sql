-- Lil Piggy strategies — WHAT WORKED, at every wallet size.
--
-- This is the other half of the data, and it answers a different question from
-- queries/cohorts.sql. Keep them apart:
--
--   cohorts.sql    "who am I like"   — matched on funding, small money only.
--                                      Peers. Answers: what happened to people
--                                      funded like me.
--   strategies.sql "what works"      — every size, whales included. Aspiration.
--                                      Answers: which behaviours held up, and
--                                      did that depend on having real money.
--
-- Whales belong here and nowhere near the peer cohort. A $2m wallet can do
-- things that are actively harmful at $500 — market-making, deep-collateral
-- leverage, LPing at a scale where fees are rounding errors. So this query
-- reports results BY SIZE BAND, which is the only honest way to use them: if a
-- behaviour only worked for whales, the band column says so, and Piggy must not
-- recommend it to a shrimp.
--
-- Schema checked against Dune docs on 17 Oct 2026 (same tables as cohorts.sql).
-- Unverified: the USDC mint constant.

WITH params AS (
  SELECT
    DATE '2026-04-01' AS window_start,
    DATE '2026-10-01' AS window_end,
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' AS usdc_mint
),

-- No upper bound on size here: whales are the point of this query.
funded AS (
  SELECT
    t.to_owner        AS wallet,
    SUM(t.amount_usd) AS total_in_usd,
    COUNT(*)          AS deposit_count
  FROM tokens_solana.transfers t, params p
  WHERE t.token_mint_address = p.usdc_mint
    AND t.block_time >= p.window_start
    AND t.block_time <  p.window_end
    AND t.to_owner IS NOT NULL
    AND t.to_owner <> t.from_owner
    AND t.amount_usd >= 10
  GROUP BY t.to_owner
  HAVING SUM(t.amount_usd) >= 50
),

sized AS (
  SELECT
    wallet,
    total_in_usd,
    CASE
      WHEN total_in_usd <  10000  THEN 'shrimp'   -- the people Piggy is for
      WHEN total_in_usd < 250000  THEN 'mid'
      ELSE 'whale'
    END AS size_band
  FROM funded
),

-- Still exclude machine rates. A market maker is not running a strategy a
-- human could follow, at any size.
activity AS (
  SELECT
    s.wallet,
    s.size_band,
    MAX(CASE WHEN t.token_bought_symbol IN ('JUPSOL','JITOSOL','MSOL','BSOL') THEN 1 ELSE 0 END) AS touched_staking,
    MAX(CASE WHEN t.token_bought_symbol IN ('USDC','USDT','PYUSD')            THEN 1 ELSE 0 END) AS moved_to_stables,
    COUNT(DISTINCT t.tx_id) AS trade_count
  FROM sized s
  JOIN dex_solana.trades t
    ON t.trader_id = s.wallet
   AND t.block_time >= DATE '2026-04-01'
   AND t.block_time <  DATE '2026-10-01'
  GROUP BY s.wallet, s.size_band
  HAVING COUNT(DISTINCT t.tx_id) BETWEEN 1 AND 2000
),

classified AS (
  SELECT
    wallet,
    size_band,
    CASE
      WHEN touched_staking = 1 AND trade_count < 40 THEN 'staked_and_sat'
      WHEN trade_count >= 200                       THEN 'overtraded'
      WHEN moved_to_stables = 1                     THEN 'held_stables'
      ELSE 'other'
    END AS behaviour
  FROM activity
),

ending AS (
  SELECT
    b.token_balance_owner AS wallet,
    MAX(b.sol_balance)    AS sol_balance,
    SUM(CASE WHEN b.token_mint_address = (SELECT usdc_mint FROM params)
             THEN b.token_balance ELSE 0 END) AS usdc_balance
  FROM solana_utils.latest_balances b
  WHERE b.token_balance_owner IN (SELECT wallet FROM sized)
  GROUP BY b.token_balance_owner
)

SELECT
  c.size_band,
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
GROUP BY c.size_band, c.behaviour
HAVING COUNT(*) >= 30
ORDER BY c.size_band, wallets DESC
