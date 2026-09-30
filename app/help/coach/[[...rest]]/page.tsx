import { redirect } from "next/navigation";

// Short link for coaches: help.tarasimonstudios.com/coach (Cloudflare
// forwards help.* to /help/...) -> the private coach help center. The
// coach portal's own layout requires a coach login, so it stays private.
// /help/coach/a/<slug> keeps pointing at the same coach article.
export default async function CoachHelpShortLink({ params }: { params: Promise<{ rest?: string[] }> }) {
  const { rest } = await params;
  redirect(`/coach/help${rest?.length ? `/${rest.map(encodeURIComponent).join("/")}` : ""}`);
}
