import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listPublicArticles } from "@/lib/support/help-center";
import { helpCategory, plainExcerpt } from "@/lib/support/help-categories";
import { AskMelPanel, HelpTopbar } from "../../help-center-parts";
import styles from "../../center.module.css";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  const c = helpCategory(category);
  return { title: `${c?.name ?? "Help"} — Tara Simon Studios help center` };
}

export default async function HelpCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const c = helpCategory(category);
  if (!c) notFound();
  const articles = (await listPublicArticles()).filter((a) => a.category === c.key);

  return (
    <div className={styles.page}>
      <HelpTopbar />
      <div className={styles.crumbs}>
        <Link href="/help">Help center</Link> › {c.name}
      </div>
      <h1 className={styles.articleTitle}>
        {c.icon} {c.name}
      </h1>
      <p className={styles.muted}>{c.blurb}</p>

      {articles.length === 0 ? (
        <p className={styles.muted}>No articles here yet.</p>
      ) : (
        <div className={styles.list} style={{ marginTop: 16 }}>
          {articles.map((a) => (
            <Link key={a.slug} href={`/help/a/${a.slug}`} className={styles.listItem}>
              <div className={styles.listTitle}>{a.title}</div>
              <div className={styles.muted}>{a.summary ?? plainExcerpt(a.body)}</div>
            </Link>
          ))}
        </div>
      )}

      <AskMelPanel />
    </div>
  );
}
