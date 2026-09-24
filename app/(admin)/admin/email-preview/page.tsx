import { createAdminClient } from "@/lib/supabase/admin";
import { firstNameOf, lessonTimeFields, portalUrl } from "@/lib/ghl/fields";
import { sessionReminder24h, type RenderedNotification } from "@/lib/email/templates/session-reminder";
import styles from "../../admin.module.css";

// Design review for student notifications — renders each template with
// real production data (the next upcoming lesson) exactly as it would
// send, at desktop and phone widths, plus the plain-text part and the
// SMS. Nothing is sent from here. Not linked from the nav; admin-only
// via app/(admin)/layout.tsx like every other page in this group.

export const dynamic = "force-dynamic";

function unwrap<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

async function sampleReminder(offset: number): Promise<{ label: string; n: RenderedNotification } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("sessions")
    .select("id, scheduled_at, duration_minutes, students(name), coaches:actual_coach_id(name, timezone)")
    .eq("status", "scheduled")
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at")
    .range(offset, offset);
  const s = data?.[0];
  if (!s) return null;
  const student = unwrap(s.students as unknown as { name: string } | null);
  const coach = unwrap(s.coaches as unknown as { name: string; timezone: string } | null);
  return {
    label: `${student?.name ?? "?"} with ${coach?.name ?? "?"}`,
    n: sessionReminder24h({
      firstName: firstNameOf(student?.name),
      coachName: coach?.name ?? "your coach",
      ...lessonTimeFields(s.scheduled_at, coach?.timezone),
      durationMinutes: s.duration_minutes,
      portalUrl: portalUrl("/student/dashboard"),
    }),
  };
}

const box: React.CSSProperties = { border: "1px solid #ccc", borderRadius: 8, background: "#fff" };

export default async function EmailPreviewPage({ searchParams }: { searchParams: { i?: string } }) {
  const i = Math.max(0, Number(searchParams.i ?? 0) || 0);
  const sample = await sampleReminder(i);

  return (
    <main className={styles.wrap}>
      <h1 className={styles.pageTitle}>Email preview · 24h lesson reminder</h1>
      {!sample ? (
        <p>No upcoming lessons to preview with.</p>
      ) : (
        <>
          <p style={{ margin: "0 0 16px" }}>
            Real data: <strong>{sample.label}</strong> ·{" "}
            <a href={`?i=${i + 1}`}>next student →</a>
          </p>
          <section style={{ ...box, padding: 16, marginBottom: 16, color: "#201d2b" }}>
            <div><strong>Subject:</strong> {sample.n.subject}</div>
            <div style={{ color: "#6b6878" }}><strong>Inbox preview:</strong> {sample.n.preheader}</div>
          </section>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
            <figure style={{ margin: 0 }}>
              <figcaption>Desktop</figcaption>
              <iframe title="desktop" srcDoc={sample.n.html} style={{ ...box, width: 640, height: 760 }} />
            </figure>
            <figure style={{ margin: 0 }}>
              <figcaption>Phone</figcaption>
              <iframe title="phone" srcDoc={sample.n.html} style={{ ...box, width: 375, height: 760 }} />
            </figure>
            <figure style={{ margin: 0, maxWidth: 360 }}>
              <figcaption>
                SMS ({sample.n.sms.length} chars{sample.n.sms.length > 160 ? " — over 1 segment!" : ""})
              </figcaption>
              <div
                style={{
                  background: "#e9e9eb",
                  color: "#000",
                  borderRadius: 18,
                  padding: "10px 14px",
                  font: "15px/1.4 -apple-system, Helvetica, Arial, sans-serif",
                  marginBottom: 16,
                }}
              >
                {sample.n.sms}
              </div>
              <figcaption>Plain-text part</figcaption>
              <pre style={{ ...box, padding: 12, whiteSpace: "pre-wrap", fontSize: 12, color: "#201d2b" }}>{sample.n.text}</pre>
            </figure>
          </div>
        </>
      )}
    </main>
  );
}
