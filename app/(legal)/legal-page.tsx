import Link from "next/link";
import { ArticleBody } from "../help/help-center-parts";
import styles from "../help/center.module.css";

export function LegalPage({ title, updated, markdown }: { title: string; updated: string; markdown: string }) {
  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/help" className={styles.brand}>
          <img src="/logo.png" alt="" />
          <span className={styles.brandName}>Tara Simon Studios</span>
        </Link>
      </header>
      <h1 className={styles.articleTitle} style={{ marginTop: 24 }}>
        {title}
      </h1>
      <p className={styles.muted} style={{ marginBottom: 24 }}>
        Last updated {updated}
      </p>
      <ArticleBody markdown={markdown} />
    </div>
  );
}
