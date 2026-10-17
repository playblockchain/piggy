import { Piggy } from "./piggy";
import styles from "./page.module.css";

function Dots() {
  return (
    <span className="dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function Window({
  title,
  tone = "green",
  children,
}: {
  title: string;
  tone?: "green" | "pink" | "blue" | "peach";
  children: React.ReactNode;
}) {
  return (
    <section className="window">
      <div className={`windowBar windowBar--${tone}`}>
        <span>{title}</span>
        <Dots />
      </div>
      <div className={styles.windowBody}>{children}</div>
    </section>
  );
}

export default function Home() {
  return (
    <main className={styles.wrap}>
      <div className={styles.topStrip}>
        <span className={styles.wordmark}>lil piggy</span>
        <span className={styles.desktopDots} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>

      <div className={styles.panel}>
        {/* The one pun on this screen lives here, in a title bar. */}
        <Window title="hello.exe" tone="green">
          <div className={styles.hero}>
            <Piggy mood="proud" size={128} />
            <div className={styles.heroText}>
              <h1 className={styles.title}>Lil Piggy</h1>
              <p className={styles.tagline}>Little pig, big feelings</p>
              <p className={styles.lede}>
                Most people with small money have no wealth manager. You have me. Show me your wallet
                and I will tell you exactly what kind of investor you are — then help you become a
                better one.
              </p>
            </div>
          </div>
        </Window>

        <Window title="What I do" tone="blue">
          <ol className={styles.steps}>
            <li className={styles.step}>
              <span className={styles.stepTitle}>I profile you</span>
              Not a quiz. I look at what you actually hold and give you a money personality you will
              either love or deny loudly.
            </li>
            <li className={styles.step}>
              <span className={styles.stepTitle}>I read your onchain behaviour</span>
              What you staked, what you left idle, what you gambled, whether you buy on a rhythm or
              keep raiding your own savings.
            </li>
            <li className={styles.step}>
              <span className={styles.stepTitle}>I make you a plan</span>
              Sized to what you can actually afford, in my voice, with every risk named out loud.
              Your agent carries it out. I never touch your money.
            </li>
          </ol>
        </Window>

        <Window title="How it is used" tone="peach">
          <p className={styles.body}>
            Lil Piggy is a paid service an AI agent calls, not an app you open. Your agent fetches
            your balances through PayBox, pays me a couple of cents over x402, and gets back a
            personality, a mood, a plan and a link to your card. If you want to act, your agent
            executes through Kamino, Jupiter or Sunrise and you approve it with your passkey.
          </p>
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
            Positions from enabled PayBox plugins — lending, perps, prediction markets — can come
            alongside the balances, and I will use them. Anything not supplied I report as unknown
            rather than guessing.
          </p>
        </Window>

        <Window title="What I cannot see" tone="pink">
          <p className={styles.body}>
            PayBox hands me current balances, not transaction history. I read history separately from
            the chain, using the address PayBox gives me — and when that is unavailable I say so on
            your card instead of inventing a habit. I do not make up your past trades.
          </p>
        </Window>

        <p className={styles.footer}>
          Lil Piggy is education, not financial advice. Yields are not guaranteed and lending and
          staking can lose money.
        </p>
      </div>
    </main>
  );
}
