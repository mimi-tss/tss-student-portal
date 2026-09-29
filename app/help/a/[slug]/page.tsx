import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticle, listPublicArticles } from "@/lib/support/help-center";
import { helpCategory, plainExcerpt } from "@/lib/support/help-categories";
import { ArticleBody, AskMelPanel, HelpTopbar } from "../../help-center-parts";
import ArticleFeedback from "../../article-feedback";
import styles from "../../center.module.css";

// Not cached: drafts are admin-previewable, which depends on who's viewing.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const found = await getArticle(slug);
  if (!found) return { title: "Help center — Tara Simon Studios" };
  return {
    title: `${found.article.title} — Tara Simon Studios help`,
    description: found.article.summary ?? plainExcerpt(found.article.body),
  };
}

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await getArticle(slug);
  if (!found) notFound();
  const { article, preview } = found;
  const category = helpCategory(article.category);
  const related = (await listPublicArticles()).filter((a) => a.category === article.category && a.slug !== article.slug).slice(0, 5);

  return (
    <div className={styles.page}>
      <HelpTopbar />
      {preview && (
        <div className={styles.preview}>
          <strong>Preview</strong> — this article isn&apos;t published yet, so only admins can see this page. Publish it in{" "}
          <Link href="/admin/support/kb" style={{ color: "var(--gold)" }}>
            Help articles
          </Link>
          .
        </div>
      )}
      <div className={styles.crumbs}>
        <Link href="/help">Help center</Link>
        {category && (
          <>
            {" "}
            › <Link href={`/help/c/${category.key}`}>{category.name}</Link>
          </>
        )}
      </div>
      <h1 className={styles.articleTitle}>{article.title}</h1>
      <p className={styles.muted} style={{ marginBottom: 24 }}>
        Updated {new Date(article.updated_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </p>

      <ArticleBody markdown={article.body} />

      {!preview && <ArticleFeedback slug={article.slug} />}
      <AskMelPanel />

      {related.length > 0 && (
        <>
          <h2 className={styles.sectionTitle}>Related articles</h2>
          <div className={styles.list}>
            {related.map((a) => (
              <Link key={a.slug} href={`/help/a/${a.slug}`} className={styles.listItem}>
                <div className={styles.listTitle}>{a.title}</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
