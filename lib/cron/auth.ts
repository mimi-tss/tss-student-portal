// Cron routes accept either secret:
//   CRON_SECRET      — GitHub Actions workflows (.github/workflows/*)
//   SCHEDULER_SECRET — Supabase pg_cron (every 5/10 min; GitHub's schedule
//                      turned out to run only every 3-5 hours, 2026-09-29)
export function isCronAuthorized(authHeader: string | null): boolean {
  if (!authHeader) return false;
  return [process.env.CRON_SECRET, process.env.SCHEDULER_SECRET].some((s) => !!s && authHeader === `Bearer ${s}`);
}
