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
          Most people with small money have no wealth manager. You have me. Show me your wallet and
          I will tell you exactly what kind of investor you are — then help you become a better one.
        </p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>What I do</h2>
        <ol className={styles.steps}>
          <li className={styles.step}>
            <strong>I profile you.</strong> Not a quiz. I look at what you actually hold and give
            you a money personality you will either love or deny loudly.
          </li>
          <li className={styles.step}>
            <strong>I read your onchain behaviour.</strong> What you staked, what you left idle,
            what you gambled, and how much of your net worth is riding on one dog coin.
          </li>
          <li className={styles.step}>
            <strong>I make you a plan.</strong> Sized to what you can actually afford, in my voice,
            with every risk named out loud. Your agent carries it out. I never touch your money.
          </li>
        </ol>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>How it is used</h2>
        <p className={styles.body}>
          Lil Piggy is a paid service an AI agent calls, not an app you open. Your agent fetches
          your balances through PayBox, pays me a couple of cents over x402, and gets back a
          personality, a mood, a plan and a link to your card. If you want to act, your agent
          executes through Kamino, Jupiter or Sunrise and you approve it with your passkey.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Calling me</h2>
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
          alongside the balances, and I will use them. Anything not supplied I report as unknown
          rather than guessing.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>What I cannot see</h2>
        <p className={styles.body}>
          PayBox hands me current balances, not transaction history. So I read what you hold today,
          plus whatever you choose to tell me. I do not invent your past trades, and I will say so
          on your card rather than pretend.
        </p>
      </section>

      <footer className={styles.footer}>
        Lil Piggy is education, not financial advice. Yields are not guaranteed and lending and
        staking can lose money.
      </footer>
    </main>
  );
}
