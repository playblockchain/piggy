-- Piggy cohort query 2 of 2: what happened to each funding cohort
--
-- Takes the wallets from cohort-funding-signature.sql and reports, for EVERY
-- wallet in the group, what it did and whether it still had money at the end of
-- the window. "Still funded" is deliberately used instead of a return figure:
-- computing real P&L needs historical prices per token per timestamp and a way
-- to separate deposits from gains, which is a much bigger job and much noisier
-- on long-tail tokens.
--
-- VERIFY BEFORE RUNNING: table names and the program/mint constants below were
-- written from memory. Confirm them in Dune's data explorer first.

WITH cohort AS (
  -- Paste the wallet list from query 1, or reference it as a Dune query result.
  SELECT wallet, funding_signature FROM query_REPLACE_ME
),

behaviour AS (
  SELECT
    c.wallet,
    c.funding_signature,
    -- Classification by venue, not by decoded instruction detail: knowing a
    -- wallet touched a perps venue is cheap, reconstructing its position is not.
    MAX(CASE WHEN t.token_bought_symbol IN ('JUPSOL', 'JITOSOL', 'MSOL', 'BSOL') THEN 1 ELSE 0 END) AS touched_staking,
    MAX(CASE WHEN t.token_bought_symbol IN ('USDC', 'USDT', 'PYUSD') THEN 1 ELSE 0 END)            AS moved_to_stables,
    COUNT(DISTINCT t.tx_hash)                                                                       AS trade_count
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
      WHEN trade_count >= 200                        THEN 'overtraded'
      WHEN moved_to_stables = 1                      THEN 'held_stables'
      ELSE 'other'
    END AS behaviour
  FROM behaviour
),

-- End-of-window balance, used only as a survival signal (did money remain).
ending AS (
  SELECT
    b.wallet,
    SUM(b.balance_usd) AS ending_usd
  FROM solana_utils.latest_balances b
  GROUP BY b.wallet
)

SELECT
  c.funding_signature,
  c.behaviour,
  COUNT(*)                                                                   AS wallets,
  ROUND(AVG(CASE WHEN COALESCE(e.ending_usd, 0) >= 25 THEN 1.0 ELSE 0.0 END), 3) AS still_funded_share
FROM classified c
LEFT JOIN ending e ON e.wallet = c.wallet
GROUP BY c.funding_signature, c.behaviour
HAVING COUNT(*) >= 30   -- never report a cohort too small to mean anything
ORDER BY c.funding_signature, wallets DESC
