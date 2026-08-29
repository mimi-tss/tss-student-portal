import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getOverviewStats, getAttentionItems } from "@/lib/admin/attention-items";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { zonedTimeToUtc } from "@/lib/timezone";
import NeedsAttentionList from "../needs-attention-list";
import styles from "../../admin.module.css";

const TIER_COLORS: Record<string, string> = {
  lite: "var(--border)",
  suite: "var(--gold)",
  pro: "#4c8fd6",
  elite: "#d4a24e",
};

// Eastern-anchored "today" bounds — admin's coach-schedule view is
// always normalized to Eastern regardless of each coach's own timezone
// (TSS_App_Spec_1.md section 8), same convention as the admin Coach
// Schedules page.
function getTodayBoundsInZone(timeZone: string) {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
  const [y, m, d] = key.split("-").map(Number);
  const dayStart = zonedTimeToUtc(y, m, d, 0, 0, timeZone);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  return { dayStart, dayEnd };
}

export default async function AdminOverviewPage() {
  const supabase = await createClient();
  const { dayStart, dayEnd } = getTodayBoundsInZone(DEFAULT_TIMEZONE);

  const [stats, needsActionItems, { data: coaches }, { data: todaySessions }, { data: previewStudents }] =
    await Promise.all([
      getOverviewStats(supabase),
      getAttentionItems(supabase, "needs_action"),
      supabase.from("coaches").select("id, name").order("name"),
      supabase
        .from("sessions")
        .select("actual_coach_id")
        .gte("scheduled_at", dayStart.toISOString())
        .lt("scheduled_at", dayEnd.toISOString())
        .not("status", "in", "(cancelled-with-notice,cancelled-no-notice,paused,holiday)"),
      supabase
        .from("students")
        .select(
          "id, name, tier, payment_status, subscription_status, paused_end, coaches(name), makeup_credits(id, used), sessions(scheduled_at, status)",
        )
        .order("name")
        .limit(5),
    ]);

  const studentRows = (previewStudents ?? []).map((s) => {
    const coach = s.coaches as unknown as { name: string } | null;
    const credits = (s.makeup_credits as unknown as { id: string; used: boolean }[] | null) ?? [];
    const availableCredits = credits.filter((c) => !c.used).length;
    const upcoming = ((s.sessions as unknown as { scheduled_at: string; status: string }[] | null) ?? [])
      .filter((sess) => sess.status === "scheduled" && new Date(sess.scheduled_at) > new Date())
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];

    let statusLabel = "Active";
    if (s.payment_status === "dnc") statusLabel = "DNC";
    else if (s.subscription_status === "paused") statusLabel = "On Hold";
    else if (s.subscription_status === "cancelled") statusLabel = "Cancelled";

    let nextSessionLabel = "—";
    if (statusLabel === "DNC") nextSessionLabel = "Held pending payment";
    else if (statusLabel === "On Hold") nextSessionLabel = s.paused_end ? `Returns ${s.paused_end}` : "On hold";
    else if (upcoming) {
      nextSessionLabel = new Date(upcoming.scheduled_at).toLocaleString("en-US", {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZone: DEFAULT_TIMEZONE,
      });
    }

    return {
      id: s.id,
      name: s.name,
      tier: s.tier,
      coachName: coach?.name ?? "—",
      statusLabel,
      credits: `${availableCredits} / ${credits.length}`,
      nextSessionLabel,
    };
  });

  const countByCoach = new Map<string, number>();
  for (const s of todaySessions ?? []) {
    countByCoach.set(s.actual_coach_id, (countByCoach.get(s.actual_coach_id) ?? 0) + 1);
  }
  const coachToday = (coaches ?? [])
    .map((c) => ({ id: c.id, name: c.name, count: countByCoach.get(c.id) ?? 0 }))
    .sort((a, b) => b.count - a.count);
  const maxCount = Math.max(1, ...coachToday.map((c) => c.count));

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: DEFAULT_TIMEZONE,
  });

  const total = stats.activeStudents || 1;
  const tierOrder: Array<keyof typeof stats.tierBreakdown> = ["lite", "suite", "pro", "elite"];

  return (
    <div>
      <div className={styles.overviewHead}>
        <h1 className={styles.overviewTitle}>Studio Overview</h1>
        <div className={styles.overviewDate}>
          {todayLabel} · {DEFAULT_TIMEZONE.replace(/_/g, " ")}
        </div>
      </div>

      <div className={styles.statCardsRow}>
        <div className={styles.overviewCard}>
          <div className={styles.overviewCardLabel}>Active students</div>
          <div className={styles.overviewCardValue}>{stats.activeStudents}</div>
          <div className={styles.tierBar}>
            {tierOrder.map((t) => (
              <div
                key={t}
                className={styles.tierBarSegment}
                style={{
                  width: `${(stats.tierBreakdown[t] / total) * 100}%`,
                  background: TIER_COLORS[t],
                }}
              />
            ))}
          </div>
          <div className={styles.tierLegend}>
            {tierOrder.map((t) => (
              <span key={t}>
                <span className={styles.tierLegendDot} style={{ background: TIER_COLORS[t] }} />
                {t[0].toUpperCase() + t.slice(1)} {stats.tierBreakdown[t]}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.overviewCard}>
          <div className={styles.overviewCardLabel}>Trial lessons not yet booked</div>
          <div className={styles.overviewCardValue}>{stats.unbookedTrials}</div>
          <div className={styles.overviewCardSub}>Suite members who upgraded but haven&apos;t scheduled</div>
        </div>

        <div className={styles.overviewCard}>
          <div className={styles.overviewCardLabel}>DNC — payment hold / failed</div>
          <div className={`${styles.overviewCardValue} ${styles.overviewCardValueWarn}`}>{stats.dncCount}</div>
          <div className={styles.overviewCardSub}>Sessions held until payment resolved</div>
        </div>

        <div className={styles.overviewCard}>
          <div className={styles.overviewCardLabel}>Needs attention</div>
          <div className={`${styles.overviewCardValue} ${styles.overviewCardValueWarn}`}>
            {stats.needsActionCount}
          </div>
          <div className={styles.overviewCardSub}>DNC, requests, holds, expiring makeups</div>
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeadRow}>
          <h2>Needs Attention</h2>
          <Link href="/admin/needs-review" className={styles.linkBtnSmall}>
            View all →
          </Link>
        </div>
        <NeedsAttentionList items={needsActionItems.slice(0, 5)} />
        {needsActionItems.length === 0 && <p className={styles.emptyState}>Nothing needs attention right now.</p>}
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeadRow}>
          <h2>Coach Schedule — Today</h2>
          <Link href="/admin/coaches" className={styles.linkBtnSmall}>
            Full week →
          </Link>
        </div>
        {coachToday.length === 0 && <p className={styles.emptyState}>No coaches yet.</p>}
        {coachToday.map((c, i) => (
          <div key={c.id} className={styles.coachTodayRow}>
            <span className={styles.coachDot} style={{ background: `hsl(${(i * 67) % 360}, 55%, 55%)` }} />
            <span className={styles.coachTodayName}>{c.name}</span>
            <span className={styles.coachTodayBar}>
              <span className={styles.coachTodayBarFill} style={{ width: `${(c.count / maxCount) * 100}%` }} />
            </span>
            <span className={styles.coachTodayCount}>{c.count} sessions</span>
          </div>
        ))}
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeadRow}>
          <h2>Students</h2>
          <Link href="/admin/dashboard" className={styles.linkBtnSmall}>
            Open full list →
          </Link>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Student</th>
              <th>Tier</th>
              <th>Coach</th>
              <th>Status</th>
              <th>Makeup Credits</th>
              <th>Next Session</th>
            </tr>
          </thead>
          <tbody>
            {studentRows.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link href={`/admin/students/${s.id}`} className={styles.rowName}>
                    {s.name}
                  </Link>
                </td>
                <td className={styles.mutedText} style={{ textTransform: "capitalize" }}>
                  {s.tier}
                </td>
                <td className={styles.mutedText}>{s.coachName}</td>
                <td>
                  <span
                    className={
                      s.statusLabel === "DNC"
                        ? styles.badgeWarn
                        : s.statusLabel === "On Hold"
                          ? styles.badge
                          : styles.badgeMuted
                    }
                  >
                    {s.statusLabel}
                  </span>
                </td>
                <td className={styles.mutedText}>{s.credits}</td>
                <td className={styles.mutedText}>{s.nextSessionLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {studentRows.length === 0 && <p className={styles.emptyState}>No students yet.</p>}
      </div>
    </div>
  );
}
