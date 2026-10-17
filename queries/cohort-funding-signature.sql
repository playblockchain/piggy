-- Piggy cohort query 1 of 2: funding signatures
--
-- Groups Solana wallets by HOW MONEY ARRIVES, not by how well they did.
-- That ordering is the point: selecting on funding and then reporting every
-- outcome is what keeps this from being a survivors' highlight reel.
--
-- Schema checked against Dune docs on 17 Oct 2026:
--   tokens_solana.transfers — from_owner, to_owner, token_mint_address,
--   amount_usd, block_time. Covers SPL, token2022 and native SOL transfers.
-- Still to confirm yourself: the USDC mint constant below, and that amount_usd
-- is populated for the window you pick. A wrong mint returns an empty result
-- that looks like a finding.

WITH params AS (
  SELECT
    DATE '2026-04-01' AS window_start,
    DATE '2026-10-01' AS window_end
),

-- Inbound USDC only: a deliberate simplification. USDC arrivals are the
-- clearest "money came in" signal and avoid pricing long-tail tokens.
deposits AS (
  SELECT
    t.to_owner     AS wallet,
    t.block_time,
    t.amount_usd   AS usd_in
  FROM tokens_solana.transfers t, params p
  WHERE t.token_mint_address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'  -- USDC
    AND t.block_time >= p.window_start
    AND t.block_time <  p.window_end
    AND t.to_owner IS NOT NULL
    AND t.to_owner <> t.from_owner
    AND t.amount_usd BETWEEN 10 AND 20000   -- ignore dust and whale flows
),

per_wallet AS (
  SELECT
    wallet,
    COUNT(*)                                           AS deposit_count,
    SUM(usd_in)                                        AS total_in_usd,
    APPROX_PERCENTILE(usd_in, 0.5)                     AS median_deposit_usd,
    DATE_DIFF('day', MIN(block_time), MAX(block_time)) AS active_days,
    -- Spread of deposit timing: a regular earner clusters, an irregular one
    -- does not. This is the signal Piggy matches people on.
    STDDEV_POP(DATE_DIFF('day', DATE '2026-04-01', CAST(block_time AS DATE))) AS gap_stddev
  FROM deposits
  GROUP BY wallet
  HAVING COUNT(*) BETWEEN 2 AND 60          -- 1 deposit says nothing; 60+ looks automated
     AND SUM(usd_in) BETWEEN 50 AND 10000   -- the small-money audience Piggy is for
)

SELECT
  wallet,
  deposit_count,
  ROUND(total_in_usd, 2)       AS total_in_usd,
  ROUND(median_deposit_usd, 2) AS median_deposit_usd,
  active_days,
  ROUND(gap_stddev, 1)         AS deposit_gap_stddev,
  CASE
    WHEN deposit_count <= 6  AND gap_stddev >  20 THEN 'irregular_topup'
    WHEN deposit_count >= 12 AND gap_stddev <= 12 THEN 'regular_topup'
    ELSE 'mixed'
  END AS funding_signature
FROM per_wallet
ORDER BY total_in_usd DESC
