import type { Metadata } from "next";
import Link from "next/link";
import { listPublicArticles } from "@/lib/support/help-center";
import { HELP_CATEGORIES, plainExcerpt } from "@/lib/support/help-categories";
import { AskMelPanel, HelpTopbar } from "./help-center-parts";
import HelpSearch from "./help-search";
import styles from "./center.module.css";

export const metadata: Metadata = { title: "Help center — Tara Simon Studios" };
// Articles are edited in /admin/support/kb — re-read at most every minute.
export const revalidate = 60;

// Public help center home — the Kajabi app's "Help & Support" link lands
// here. Articles come from the same table Mel answers from; only ones
// marked public show up here.
export default async function HelpCenterHome() {
  const articles = await listPublicArticles();
  const categories = HELP_CATEGORIES.map((c) => ({
    ...c,
    articles: articles.filter((a) => a.category === c.key),
  })).filter((c) => c.articles.length > 0);

  return (
    <div className={styles.page}>
      <HelpTopbar />

      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>How can we help?</h1>
        <HelpSearch
          items={articles.map((a) => ({
            slug: a.slug,
            title: a.title,
            category: a.category,
            excerpt: a.summary ?? plainExcerpt(a.body),
            text: `${a.summary ?? ""} ${a.body}`,
          }))}
        />
      </section>

      {categories.length === 0 ? (
        <p className={styles.muted} style={{ textAlign: "center" }}>
          Articles are coming soon — in the meantime, Mel can help with anything.
        </p>
      ) : (
        <div className={styles.grid}>
          {categories.map((c) => (
            <Link key={c.key} href={`/help/c/${c.key}`} className={styles.card}>
              <div className={styles.cardIcon}>{c.icon}</div>
              <div className={styles.cardTitle}>{c.name}</div>
              <div className={styles.muted}>{c.blurb}</div>
              <div className={styles.muted} style={{ marginTop: 8, fontSize: 13 }}>
                {c.articles.length} {c.articles.length === 1 ? "article" : "articles"}
              </div>
            </Link>
          ))}
        </div>
      )}

      <AskMelPanel text="Can't find what you need?" />
    </div>
  );
}
