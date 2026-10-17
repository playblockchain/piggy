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
            <Piggy mood="proud" scenario="healthy_portfolio" size={128} />
            <div className={styles.heroText}>
              <h1 className={styles.title}>Lil Piggy</h1>
              <p className={styles.tagline}>Little pig, big feelings</p>
              <p className={styles.lede}>
                You do not have a wealth manager. You have me: a tiny, emotionally unstable diva
                whose entire personality depends on your financial decisions. Show me your wallet.
                I will profile you, read your onchain behaviour, and either shame you or lose my
                mind with pride.
              </p>
            </div>
          </div>
        </Window>

        <Window title="How it is used" tone="peach">
          <p className={styles.body}>
            Lil Piggy is a paid service an AI agent calls, not an app you open. Give me an
            address — your own, one PayBox has connected, an ENS name, or a stranger&rsquo;s — and I
            go and read it myself across Solana, Ethereum, Base and Polygon, plus Hyperliquid,
            Veranta and Polymarket. Your agent pays me a couple of cents over x402 and gets back a
            personality, a mood, a plan and a link to your card. If you want to act, your agent
            executes through Kamino, Jupiter or Sunrise and you approve it with your passkey.
          </p>
          <pre className={styles.code}>
            <code>{`POST /api/analyze
Content-Type: application/json

{
  "addresses": ["vitalik.eth", "<solana or evm address>"],
  "selfReported": { "incomeRegularity": "irregular" }
}`}</code>
          </pre>
          <p className={styles.note}>
            Send <code>wallets</code> with balances instead if you already have them, and I will
            use those rather than fetching. Positions from enabled PayBox plugins can come
            alongside either. Anything I cannot read I report as unknown rather than guessing.
          </p>
        </Window>

        <Window title="What I cannot see" tone="pink">
          <p className={styles.body}>
            I read six months of transaction history from the chain, not from PayBox — and when a
            chain or a venue is unavailable I say so on your card instead of inventing a habit. I
            do not make up your past trades. Airdropped tokens whose name is an advert are left
            out, and a token quoting a price far beyond everything else in the wallet is carried
            as unvalued rather than counted: anyone can seed a pool.
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
