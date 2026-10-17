-- Piggy cohort query 2 of 2: what happened to each funding cohort
--
-- Takes the wallets from cohort-funding-signature.sql and reports, for EVERY
-- wallet in the group, what it did and whether it still had money at the end.
--
-- "Still funded" is used instead of a return figure on purpose. Real P&L needs
-- historical prices per token per timestamp plus a way to separate deposits
-- from gains — a much bigger job, and very noisy on long-tail tokens. Survival
-- is cheap, honest, and the better story: did the money last.
--
-- Schema checked against Dune docs on 17 Oct 2026:
--   dex_solana.trades        — trader_id, tx_id, amount_usd, token_bought_symbol,
--                              block_time. One row per leg, so multi-hop swaps
--                              appear more than once: dedupe on tx_id.
--   solana_utils.latest_balances — address, sol_balance, token_balance,
--                              token_mint_address, token_balance_owner.
--                              NOTE: no USD column, so survival is measured in
--                              token units, not dollars. Filter it hard; it is big.

WITH cohort AS (
  -- Paste the wallet list from query 1, or reference it as a Dune query result.
  SELECT wallet, funding_signature FROM query_REPLACE_ME
),

activity AS (
  SELECT
    c.wallet,
    c.funding_signature,
    -- Classification by what was bought, not by decoding instruction layouts:
    -- knowing a wallet touched staking is cheap, reconstructing size is not.
    MAX(CASE WHEN t.token_bought_symbol IN ('JUPSOL', 'JITOSOL', 'MSOL', 'BSOL') THEN 1 ELSE 0 END) AS touched_staking,
    MAX(CASE WHEN t.token_bought_symbol IN ('USDC', 'USDT', 'PYUSD') THEN 1 ELSE 0 END)             AS moved_to_stables,
    COUNT(DISTINCT t.tx_id)                                                                          AS trade_count
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

-- Survival proxy, in token units: still holding meaningful USDC, or enough SOL
-- to still be playing. Deliberately crude, and labelled as such wherever shown.
ending AS (
  SELECT
    b.token_balance_owner AS wallet,
    MAX(b.sol_balance)    AS sol_balance,
    SUM(CASE
          WHEN b.token_mint_address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
          THEN b.token_balance ELSE 0
        END)              AS usdc_balance
  FROM solana_utils.latest_balances b
  WHERE b.token_balance_owner IN (SELECT wallet FROM cohort)
  GROUP BY b.token_balance_owner
)

SELECT
  c.funding_signature,
  c.behaviour,
  COUNT(*) AS wallets,
  ROUND(
    AVG(
      CASE
        WHEN COALESCE(e.usdc_balance, 0) >= 25 OR COALESCE(e.sol_balance, 0) >= 0.15
        THEN 1.0 ELSE 0.0
      END
    ), 3
  ) AS still_funded_share
FROM classified c
LEFT JOIN ending e ON e.wallet = c.wallet
GROUP BY c.funding_signature, c.behaviour
HAVING COUNT(*) >= 30   -- never report a cohort too small to mean anything
ORDER BY c.funding_signature, wallets DESC
