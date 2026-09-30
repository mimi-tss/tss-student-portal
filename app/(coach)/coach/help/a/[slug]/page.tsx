import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCoachArticle } from "@/lib/support/help-center";
import { helpCategory } from "@/lib/support/help-categories";
import { ArticleBody } from "@/app/help/help-center-parts";
import AskMelButton from "@/components/ask-mel-button";
import styles from "@/app/help/center.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await getCoachArticle(slug);
  return { title: `${article?.title ?? "Coach help"} — Tara Simon Studios` };
}

export default async function CoachHelpArticle({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getCoachArticle(slug);
  if (!article) notFound();
  const category = helpCategory(article.category);

  return (
    <div className={styles.page}>
      <div className={styles.crumbs}>
        <Link href="/coach/help">Coach help</Link>
        {category && <> › {category.name}</>}
      </div>
      <h1 className={styles.articleTitle}>{article.title}</h1>
      <p className={styles.muted} style={{ marginBottom: 24 }}>
        Updated {new Date(article.updated_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </p>
      <ArticleBody markdown={article.body} />
      <div className={styles.panel}>
        <strong>Still stuck?</strong>
        <div className={styles.row}>
          <AskMelButton className={styles.askBtn} />
        </div>
      </div>
    </div>
  );
}
