import type { Metadata } from "next";
import Link from "next/link";
import { listCoachArticles } from "@/lib/support/help-center";
import { COACH_HELP_CATEGORIES, plainExcerpt } from "@/lib/support/help-categories";
import HelpSearch from "@/app/help/help-search";
import AskMelButton from "@/components/ask-mel-button";
import styles from "@/app/help/center.module.css";

export const metadata: Metadata = { title: "Coach help — Tara Simon Studios" };
export const dynamic = "force-dynamic";

// Private coach help center — inside the (coach) route group, so the
// coach layout already requires a coach login. Articles with audience
// "coaches" or "both" (edited in /admin/support/kb) — never shown on the
// public /help.
export default async function CoachHelpHome() {
  const articles = await listCoachArticles();
  const categories = COACH_HELP_CATEGORIES.map((c) => ({
    ...c,
    articles: articles.filter((a) => a.category === c.key),
  })).filter((c) => c.articles.length > 0);

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>Coach help</h1>
        <HelpSearch
          basePath="/coach/help/a"
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
          Coach articles are coming soon — in the meantime, Mel can help.
        </p>
      ) : (
        categories.map((c) => (
          <section key={c.key}>
            <h2 className={styles.sectionTitle}>
              {c.icon} {c.name}
            </h2>
            <div className={styles.list}>
              {c.articles.map((a) => (
                <Link key={a.slug} href={`/coach/help/a/${a.slug}`} className={styles.listItem}>
                  <div className={styles.listTitle}>{a.title}</div>
                  <div className={styles.muted}>{a.summary ?? plainExcerpt(a.body)}</div>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}

      <div className={styles.panel}>
        <strong>Can&apos;t find it?</strong>
        <p className={styles.muted} style={{ margin: "4px 0 0" }}>
          Ask Mel, or it&apos;ll pass your question to the studio admin.
        </p>
        <div className={styles.row}>
          <AskMelButton className={styles.askBtn} />
        </div>
      </div>
    </div>
  );
}
