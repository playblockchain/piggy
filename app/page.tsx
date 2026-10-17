import { Piggy } from "./piggy";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <Piggy mood="proud" size={120} />
        <h1 className={styles.title}>Lil Piggy</h1>
        <p className={styles.tagline}>We make wealth management easy.</p>
        <p className={styles.lede}>
          A wealth manager who lives in your agent. Lil Piggy reads a wallet snapshot, tells you
          what kind of investor it makes you, and hands back a plan your agent can carry out.
        </p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>How it is used</h2>
        <p className={styles.body}>
          Piggy is a paid service an AI agent calls, not an app you open. Your agent fetches your
          balances through PayBox, pays Piggy a couple of cents over x402, and gets back a
          personality, a mood, a plan and a link to a card page like the one it generates for you.
          If you decide to act, your agent executes through PayBox — Piggy never holds your funds
          and never signs anything.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Calling it</h2>
        <pre className={styles.code}>
          <code>{`POST /api/analyze
Content-Type: application/json

{
  "wallets": [
    {
      "chain": "solana",
      "address": "<address>",
      "balances": [
        { "symbol": "USDC", "amount": 120, "usdValue": 120 },
        { "symbol": "JUPSOL", "amount": 1.4, "usdValue": 210 }
      ]
    }
  ],
  "selfReported": { "incomeRegularity": "irregular" }
}`}</code>
        </pre>
        <p className={styles.note}>
          Positions from enabled PayBox plugins — lending, perps, prediction markets — can be passed
          alongside the balances, and Piggy will use them. Anything not supplied is reported as
          unknown rather than guessed.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>What Piggy cannot see</h2>
        <p className={styles.body}>
          PayBox returns current balances, not transaction history. So Piggy reads what you hold
          today, plus whatever you choose to tell it. It does not infer your past trades, and it
          does not claim to.
        </p>
      </section>

      <footer className={styles.footer}>
        Piggy is education, not financial advice. Yields are not guaranteed and lending and staking
        can lose money.
      </footer>
    </main>
  );
}
