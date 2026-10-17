# Piggy

A wealth manager who lives in your agent. Piggy reads a wallet snapshot, says what kind of
investor it makes you, and hands back a plan your agent can carry out.

Built for the MoonPay PayBox Hackathon, Chapter 1.

## What this is

An x402-paid HTTP service, not an app. An agent with PayBox connected fetches the user's
balances, pays Piggy a couple of cents per call, and gets back a personality, a mood, a plan
and a link to a shareable card page. If the user decides to act, **the agent** executes
through PayBox. Piggy never holds funds, never signs, and stores nothing.

Execution is pointed at the PayBox plugins that can actually act: **Kamino** (deposit and
withdraw from lending vaults), **Jupiter** (trade and earn) and **Sunrise** (trade listed
Solana assets). Plugins that only browse — Aave, Hyperliquid — are useful as inputs, and are
never offered as a way to carry something out. All three execution plugins are Solana, which
is why the cohort queries are Solana-first too.

## Endpoints

| Route | What it does | Paid |
|---|---|---|
| `POST /api/analyze` | Snapshot in, personality + mood + plan + card link out | yes, x402 |
| `GET /card/[token]` | The shareable card. Entirely encoded in its own URL | no |
| `GET /` | What Piggy is and how an agent calls it | no |

## Running it

```bash
npm install
cp .env.example .env.local   # X402_PAY_TO can stay empty while developing
npm run dev
```

With `X402_PAY_TO` unset the analyze endpoint runs free, so you can develop without a wallet.
Set it to charge.

## The honesty rules this code follows

Piggy asserts things about someone's money, so a wrong number is worse than no number:

- **Every figure carries a basis** — `observed`, `inferred`, `self-reported` or `unknown`.
- **No prices, no shares.** If the caller sends balances without USD values, shares are
  reported as unavailable rather than computed from token counts.
- **Cohorts ship empty.** `data/cohorts.json` contains no numbers. Until it is filled from
  real queries, the card says so.
- **Blind spots are shown, not hidden.** PayBox returns balances, not history, so Piggy says
  plainly that it cannot see deposits, streaks or past trades.
- **Plans are education, never advice**, and every step names its risk.

## Transaction history

PayBox returns balances, not history — but it hands over the wallet *address*, and everything
that address has ever done is public. So habits over time come from an indexer
(`lib/history.ts`, currently Helius), read with the address PayBox supplies.

This unlocks the two habits a snapshot can never show: **DCA/saving** and **raiding savings**.

Set `HELIUS_API_KEY` to turn it on. Without it, habits are reported as unavailable and the
blind spots say exactly why — they are never inferred from holdings.

Each reading reports what it *measured*, not what it concluded: "5 swaps spread over about 6
weeks, timing varying by about 3 days" rather than "you DCA". Intent is not observable; cadence
is.

The pure transform is covered by fixture tests, because the live provider response cannot be
verified without a key:

```bash
npm run test:history
```

## Cohorts

The differentiated part of Piggy is comparing a user to wallets funded like them. Cohorts are
grouped by **funding signature** — how money arrives — and then outcomes are reported for every
wallet in the group. Selecting on funding rather than on returns is what stops it being a
survivors' highlight reel.

`queries/` holds the SQL. Both files carry a verification header: the table and mint constants
were written from memory and must be checked against Dune's live catalog before the results are
used. Run them, sanity-check a few wallets by hand, then paste results into `data/cohorts.json`.

Outcomes are measured as **survival** (did money remain), not returns. Real P&L needs historical
prices per token per timestamp and a way to separate deposits from gains — a much bigger job,
and very noisy on long-tail tokens.

## Not yet done

- `data/cohorts.json` is empty; the queries have not been run.
- The artwork in `app/piggy.tsx` is a vector stand-in for the real illustrations.
- No real PayBox call has been made end to end yet.
- The live Helius request in `fetchHistory` has never run against the real API — only its
  pure transform is tested. The first call with a real key is the thing to watch.
