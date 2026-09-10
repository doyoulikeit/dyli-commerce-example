import Image from "next/image";
import styles from "./storefront-setup.module.css";

export function StorefrontSetup() {
  return (
    <main className={styles.screen}>
      <section className={styles.card} aria-labelledby="setup-title">
        <Image src="/icon.svg" alt="" width={44} height={44} />
        <h1 id="setup-title">Connect your storefront.</h1>
        <p>Add your Commerce API key. DYLI discovers your application and its settings automatically.</p>
        <pre aria-label="Required environment variables"><code>DYLI_API_KEY=…</code></pre>
        <div className={styles.check}>
          <span>Check your connection</span>
          <code>npm run doctor</code>
        </div>
        <p className={styles.note}>Using a sandbox? Add the API URL supplied by DYLI. Managed sign-in also needs your approved domain.</p>
        <a href="https://www.dyli.io/docs/api/commerce" target="_blank" rel="noopener noreferrer">Integration guide <span aria-hidden="true">↗</span></a>
      </section>
    </main>
  );
}
