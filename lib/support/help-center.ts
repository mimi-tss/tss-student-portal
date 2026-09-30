import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/auth/roles";

export interface HelpArticle {
  id: string;
  slug: string;
  category: string;
  title: string;
  summary: string | null;
  body: string;
  is_public: boolean;
  active: boolean;
  sort_order: number;
  updated_at: string;
  audience: "students" | "coaches" | "both";
}

const COLUMNS = "id, slug, category, title, summary, body, is_public, active, sort_order, updated_at, audience";

// Everything the public help center shows. Service-role read (pages are
// public, no session needed), filtered to published + active.
export async function listPublicArticles(): Promise<HelpArticle[]> {
  const { data } = await createAdminClient()
    .from("support_kb_articles")
    .select(COLUMNS)
    .eq("is_public", true)
    .eq("active", true)
    .in("audience", ["students", "both"])
    .order("sort_order")
    .order("title");
  return (data as HelpArticle[] | null) ?? [];
}

async function viewerIsAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return isAdminRole(data?.role);
}

// One article by slug. Drafts (not public / inactive) are visible to
// admins only, so they can preview before publishing.
export async function getArticle(slug: string): Promise<{ article: HelpArticle; preview: boolean } | null> {
  const { data } = await createAdminClient().from("support_kb_articles").select(COLUMNS).eq("slug", slug).maybeSingle();
  const article = data as HelpArticle | null;
  if (!article) return null;
  if (article.is_public && article.active && article.audience !== "coaches") return { article, preview: false };
  return (await viewerIsAdmin()) ? { article, preview: true } : null;
}

// The private coach help center (/coach/help — the coach layout already
// requires a coach login): published + active coach/both articles.
export async function listCoachArticles(): Promise<HelpArticle[]> {
  const { data } = await createAdminClient()
    .from("support_kb_articles")
    .select(COLUMNS)
    .eq("is_public", true)
    .eq("active", true)
    .in("audience", ["coaches", "both"])
    .order("sort_order")
    .order("title");
  return (data as HelpArticle[] | null) ?? [];
}

export async function getCoachArticle(slug: string): Promise<HelpArticle | null> {
  const { data } = await createAdminClient()
    .from("support_kb_articles")
    .select(COLUMNS)
    .eq("slug", slug)
    .eq("is_public", true)
    .eq("active", true)
    .in("audience", ["coaches", "both"])
    .maybeSingle();
  return (data as HelpArticle | null) ?? null;
}

export function helpBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.tarasimonstudios.com";
}
