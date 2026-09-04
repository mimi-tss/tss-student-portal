"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import NotesPanel from "@/components/notes-panel";
import ChatPanel from "@/components/chat-panel";
import SharedFolderPanel from "@/components/shared-folder-panel";
import { FormattedDate, FormattedDateTime } from "@/components/formatted-time";
import { useTimeZone } from "@/components/timezone-context";
import { formatPlainDate } from "@/lib/format-date";
import AssignExercisePanel from "@/components/assign-exercise-panel";
import AssignedExercisesList from "@/components/assigned-exercises-list";
import styles from "../../coach.module.css";
import type { TodaySession, ExpiringMakeup, UpcomingBirthday, StudentSnapshot } from "@/lib/coach/dashboard-data";
import type { CoachGroupLesson } from "@/lib/group-lessons";

const TIER_LABEL: Record<string, string> = {
  lite: "Lite",
  suite: "Suite",
  pro: "Pro",
  elite: "Elite",
};

interface AssignedExercise {
  id: string;
  exerciseId: string | null;
  title: string;
  description: string | null;
  audioUrl: string | null;
}

function monthYear(iso: string, timeZone: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone });
}

function money(n: number) {
  return n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;
}

function statusDotClass(session: TodaySession): string {
  if (session.status === "attended") return styles.dotAttended;
  if (session.status === "no-show" || session.status === "late-forfeit") return styles.dotNoShow;
  // Held, not upcoming — a late cancellation stays blocked from
  // rebooking (no one else can take the slot), same grey the calendar
  // grid uses for this and for a paused student's reserved slot ("paused"
  // status, migration 0040 — a session that already existed when the
  // pause was set).
  if (session.status === "cancelled-no-notice" || session.status === "paused" || session.status === "holiday")
    return styles.dotHeld;
  if (session.isTrial) return styles.dotTrial;
  return styles.dotUpcoming;
}

const STATUS_LABEL: Record<string, string> = {
  attended: "Attended",
  "no-show": "No-show",
  "late-forfeit": "Late-forfeit",
  "cancelled-no-notice": "Late cancel — held",
  paused: "Paused — held, not paid",
  holiday: "Studio holiday — held, not paid",
};

// A coach can re-mark a session any time, not just once — quick-mark
// controls stay visible (not just while unmarked) so a wrong tap is
// correctable and the current mark is always visible, not just implied
// by a dot color. A late cancellation or a paused-held slot is already
// resolved (nothing to attend-mark), so neither gets quick-mark controls.
function canMark(session: TodaySession): boolean {
  if (session.status === "cancelled-no-notice" || session.status === "paused" || session.status === "holiday")
    return false;
  if (session.status !== "scheduled") return true;
  const sessionEnd = new Date(session.scheduledAt).getTime() + session.durationMinutes * 60 * 1000;
  return sessionEnd <= Date.now();
}

export default function DashboardClient({
  coachName,
  meetLink,
  currentProfileId,
  today,
  todayGroupLessons,
  expiringMakeups,
  birthdays,
  catalog,
  initialStudentId,
  initialSnapshot,
  initialAssignedExercises,
  initialDriveFolderId,
  newPayroll,
}: {
  coachName: string;
  meetLink: string | null;
  currentProfileId: string;
  today: TodaySession[];
  todayGroupLessons: CoachGroupLesson[];
  expiringMakeups: ExpiringMakeup[];
  birthdays: UpcomingBirthday[];
  catalog: { id: string; title: string }[];
  initialStudentId: string | null;
  initialSnapshot: StudentSnapshot | null;
  initialAssignedExercises: AssignedExercise[];
  initialDriveFolderId: string | null;
  newPayroll: { total: number; count: number; periodStart: string; periodEnd: string } | null;
}) {
  const router = useRouter();
  const { timeZone: displayTimeZone } = useTimeZone();
  const [collapsed, setCollapsed] = useState(false);
  const [sessions, setSessions] = useState(today);
  const [groupLessons, setGroupLessons] = useState(todayGroupLessons);
  const [selectedId, setSelectedId] = useState(initialStudentId);
  const [selectedGroupLessonId, setSelectedGroupLessonId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [driveFolderId, setDriveFolderId] = useState(initialDriveFolderId);
  const [assignedExercises, setAssignedExercises] = useState(initialAssignedExercises);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [markingGroup, setMarkingGroup] = useState(false);
  const [broadcastText, setBroadcastText] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<{ sent: number; total: number; failed: string[] } | null>(
    null,
  );
  const [broadcastError, setBroadcastError] = useState<string | null>(null);

  const selectStudent = useCallback(
    (studentId: string) => {
      setSelectedGroupLessonId(null);
      if (studentId === selectedId) return;
      setSelectedId(studentId);
      setLoadingSnapshot(true);
      router.replace(`/coach/dashboard?student=${studentId}`, { scroll: false });

      fetch(`/api/coach/student-snapshot?studentId=${studentId}`)
        .then((res) => res.json())
        .then((data) => {
          setSnapshot(data.snapshot ?? null);
          setDriveFolderId(data.driveFolderId ?? null);
          setAssignedExercises(data.assignedExercises ?? []);
        })
        .finally(() => setLoadingSnapshot(false));
    },
    [selectedId, router],
  );

  // Just the assigned-exercises list, for after an assign — assignedExercises
  // is plain client state (not derived from a server component), so unlike
  // the admin student-detail page a router.refresh() alone wouldn't update
  // what's on screen. Skips loadingSnapshot so it doesn't dim the whole
  // snapshot panel for what's really a one-list update.
  const refreshAssignedExercises = useCallback((studentId: string) => {
    fetch(`/api/coach/student-snapshot?studentId=${studentId}`)
      .then((res) => res.json())
      .then((data) => setAssignedExercises(data.assignedExercises ?? []));
  }, []);

  function selectGroupLesson(groupLessonId: string) {
    setSelectedId(null);
    setSelectedGroupLessonId(groupLessonId);
    setBroadcastText("");
    setBroadcastResult(null);
    setBroadcastError(null);
  }

  // Sends one typed message into EACH registered student's own
  // individual chat thread (never a shared thread the class sees each
  // other in — see the broadcast route's own comment). Students reply
  // normally afterward in their existing individual chat, nothing
  // group-shaped on their side.
  async function handleBroadcast(groupLessonId: string) {
    if (!broadcastText.trim()) return;
    setBroadcasting(true);
    setBroadcastError(null);
    setBroadcastResult(null);
    try {
      const res = await fetch("/api/coach/group-lessons/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupLessonId, message: broadcastText.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBroadcastError(data.error ?? "Couldn't send that message.");
        return;
      }
      setBroadcastResult({ sent: data.sent ?? 0, total: data.total ?? 0, failed: data.failed ?? [] });
      setBroadcastText("");
    } catch {
      setBroadcastError("Couldn't send that message — try again.");
    } finally {
      setBroadcasting(false);
    }
  }

  async function handleMarkGroupAttendee(registrationId: string, status: "attended" | "no-show") {
    setMarkingGroup(true);
    const res = await fetch("/api/coach/mark-group-attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationId, status }),
    });
    setMarkingGroup(false);
    if (res.ok) {
      setGroupLessons((prev) =>
        prev.map((g) => ({
          ...g,
          attendees: g.attendees.map((a) => (a.registrationId === registrationId ? { ...a, status } : a)),
        })),
      );
    }
  }

  async function handleMark(sessionId: string, status: "attended" | "no-show") {
    // Same call whether this is the first mark or a correction — the
    // route just updates the row, no "already marked" restriction
    // server-side.
    const res = await fetch("/api/coach/mark-attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, status }),
    });
    if (res.ok) {
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, status, needsAttendance: false } : s)));
    }
  }

  const selectedTodaySession = sessions.find((s) => s.studentId === selectedId);
  const selectedGroupLesson = groupLessons.find((g) => g.id === selectedGroupLessonId);
  const groupLessonNeedsAttendance = (g: CoachGroupLesson) =>
    new Date(g.scheduledAt).getTime() + g.durationMinutes * 60 * 1000 <= Date.now() &&
    g.attendees.some((a) => a.status === "registered");
  const needsAttendanceCount =
    sessions.filter((s) => s.needsAttendance).length + groupLessons.filter(groupLessonNeedsAttendance).length;
  const totalTodayCount = sessions.length + groupLessons.length;

  return (
    <div>
      <div className={styles.dashHero}>
        <div className={styles.dashHeroLeft}>
          <div className={styles.pageTitle} style={{ marginBottom: 6 }}>
            Good {new Date().getHours() < 12 ? "morning" : "afternoon"}, Coach {coachName.split(" ")[0]}
          </div>
          <p className={styles.panelText}>
            You have {totalTodayCount} session{totalTodayCount === 1 ? "" : "s"} today
            {expiringMakeups.length > 0 ? ` · ${expiringMakeups.length} makeup${expiringMakeups.length === 1 ? "" : "s"} need scheduling` : ""}
          </p>
          {meetLink && (
            <p className={styles.panelText} style={{ marginTop: 4 }}>
              <a href={meetLink} target="_blank" rel="noopener noreferrer" className={styles.linkBtn}>
                Open my meeting room →
              </a>
            </p>
          )}
        </div>
        <div className={styles.statPills}>
          <div className={styles.statPill}>
            <div className={styles.statPillValue}>{totalTodayCount}</div>
            <div className={styles.statPillLabel}>Today</div>
          </div>
          <div className={styles.statPill}>
            <div className={styles.statPillValue}>{needsAttendanceCount}</div>
            <div className={styles.statPillLabel}>Needs Attendance</div>
          </div>
          <div className={styles.statPill}>
            <div className={styles.statPillValue}>{birthdays.length}</div>
            <div className={styles.statPillLabel}>Birthdays</div>
          </div>
          <div className={styles.statPill}>
            <div className={styles.statPillValue}>{expiringMakeups.length}</div>
            <div className={styles.statPillLabel}>Makeups Expiring</div>
          </div>
        </div>
      </div>

      {newPayroll && (
        <div
          style={{
            background: "var(--gold-dim)",
            border: "1px solid rgba(167, 139, 250, 0.35)",
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: "var(--gold)", fontSize: 13 }}>New payroll ready</p>
            <p className={styles.panelText} style={{ margin: "4px 0 0" }}>
              {money(newPayroll.total)} across {newPayroll.count} entr{newPayroll.count === 1 ? "y" : "ies"}, for{" "}
              <FormattedDate value={newPayroll.periodStart} /> – <FormattedDate value={newPayroll.periodEnd} />.
            </p>
          </div>
          <a
            href={`/coach/payroll?start=${encodeURIComponent(newPayroll.periodStart)}&end=${encodeURIComponent(newPayroll.periodEnd)}`}
            className={styles.cta}
            style={{ textDecoration: "none", flexShrink: 0 }}
          >
            View payroll →
          </a>
        </div>
      )}

      <div className={`${styles.dashLayout} ${collapsed ? styles.collapsed : ""}`}>
        <button className={styles.expandTab} onClick={() => setCollapsed(false)}>
          Show schedule
        </button>

        <div className={styles.scheduleCol}>
          <div className={styles.scheduleHeadRow}>
            <h2>Today&rsquo;s Schedule</h2>
            <button className={styles.collapseBtn} onClick={() => setCollapsed(true)}>
              Collapse
            </button>
          </div>

          {totalTodayCount === 0 ? (
            <p className={styles.panelText}>Nothing on your schedule today.</p>
          ) : (
            <div>
              {[
                ...sessions.map((s) => ({ kind: "session" as const, at: s.scheduledAt, s })),
                ...groupLessons.map((g) => ({ kind: "group" as const, at: g.scheduledAt, g })),
              ]
                .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
                .map((row) =>
                  row.kind === "session" ? (
                    <div
                      key={row.s.id}
                      className={`${styles.scheduleRow} ${row.s.studentId === selectedId ? styles.scheduleRowActive : ""}`}
                      onClick={() => selectStudent(row.s.studentId)}
                    >
                      <span className={`${styles.statusDot} ${statusDotClass(row.s)}`} />
                      <span className={styles.scheduleRowTime}>
                        <FormattedDateTime value={row.s.scheduledAt} />
                      </span>
                      <span className={styles.scheduleRowInfo}>
                        <div className={styles.scheduleRowName}>{row.s.studentName}</div>
                        <div className={styles.scheduleRowSub}>
                          {TIER_LABEL[row.s.tier] ?? row.s.tier} · {row.s.durationMinutes} min
                          {row.s.isTrial ? " · Trial" : ""}
                          {STATUS_LABEL[row.s.status] ? ` · ${STATUS_LABEL[row.s.status]}` : ""}
                        </div>
                      </span>
                      {canMark(row.s) && (
                        <span className={styles.quickMark}>
                          <button
                            className={`${styles.quickMarkBtn} ${row.s.status === "attended" ? styles.quickMarkYesActive : styles.quickMarkYes}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMark(row.s.id, "attended");
                            }}
                            title={row.s.status === "attended" ? "Marked attended" : "Mark attended"}
                          >
                            ✓
                          </button>
                          <button
                            className={`${styles.quickMarkBtn} ${row.s.status === "no-show" ? styles.quickMarkNoActive : styles.quickMarkNo}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMark(row.s.id, "no-show");
                            }}
                            title={row.s.status === "no-show" ? "Marked no-show" : "Mark no-show"}
                          >
                            ✕
                          </button>
                        </span>
                      )}
                    </div>
                  ) : (
                    <div
                      key={row.g.id}
                      className={`${styles.scheduleRow} ${row.g.id === selectedGroupLessonId ? styles.scheduleRowActive : ""}`}
                      onClick={() => selectGroupLesson(row.g.id)}
                    >
                      <span className={`${styles.statusDot} ${styles.dotGroup}`} />
                      <span className={styles.scheduleRowTime}>
                        <FormattedDateTime value={row.g.scheduledAt} />
                      </span>
                      <span className={styles.scheduleRowInfo}>
                        <div className={styles.scheduleRowName}>{row.g.topic || "Group Lesson"}</div>
                        <div className={styles.scheduleRowSub}>
                          {row.g.attendees.length} student{row.g.attendees.length === 1 ? "" : "s"} ·{" "}
                          {row.g.durationMinutes} min
                        </div>
                      </span>
                    </div>
                  ),
                )}
            </div>
          )}

          {(expiringMakeups.length > 0 || birthdays.length > 0) && (
            <div className={styles.panel} style={{ marginTop: 20 }}>
              {expiringMakeups.length > 0 && (
                <>
                  <h2>Makeups Expiring Soon</h2>
                  {expiringMakeups.map((m) => (
                    <div key={`${m.studentId}-${m.expiresAt}`} className={styles.reminderItem}>
                      <span className={styles.reminderIcon}>⏳</span>
                      <span>
                        <b>{m.studentName}</b> — credit expires in {m.daysLeft} day{m.daysLeft === 1 ? "" : "s"}, not yet booked
                      </span>
                    </div>
                  ))}
                </>
              )}
              {birthdays.length > 0 && (
                <>
                  <h2 style={{ marginTop: expiringMakeups.length > 0 ? 16 : 0 }}>Birthdays This Week</h2>
                  {birthdays.map((b) => (
                    <div key={b.studentId} className={styles.reminderItem}>
                      <span className={styles.reminderIcon}>🎂</span>
                      <span>
                        <b>{b.studentName}</b> — {b.month}/{b.day} (turning {b.age})
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <div className={styles.detailCol}>
          {selectedGroupLesson ? (
            <div>
              <div className={styles.scheduleHeadRow}>
                <h2 style={{ fontSize: 20, fontFamily: "var(--font-anton), sans-serif", fontWeight: 400 }}>
                  {selectedGroupLesson.topic || "Group Lesson"}
                </h2>
                <span className={styles.panelText}>
                  <FormattedDateTime value={selectedGroupLesson.scheduledAt} /> · {selectedGroupLesson.durationMinutes} min
                </span>
              </div>
              <div className={styles.panel}>
                <h2>Roster ({selectedGroupLesson.attendees.length})</h2>
                {selectedGroupLesson.attendees.length === 0 ? (
                  <p className={styles.panelText}>No students registered yet.</p>
                ) : (
                  <ul className={styles.list}>
                    {selectedGroupLesson.attendees.map((a) => (
                      <li
                        key={a.registrationId}
                        className={styles.listItem}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
                      >
                        <span className={styles.statValue}>{a.studentName}</span>
                        <span className={styles.quickMark}>
                          <button
                            className={`${styles.quickMarkBtn} ${a.status === "attended" ? styles.quickMarkYesActive : styles.quickMarkYes}`}
                            onClick={() => handleMarkGroupAttendee(a.registrationId, "attended")}
                            disabled={markingGroup}
                            title={a.status === "attended" ? "Marked attended" : "Mark attended"}
                          >
                            ✓
                          </button>
                          <button
                            className={`${styles.quickMarkBtn} ${a.status === "no-show" ? styles.quickMarkNoActive : styles.quickMarkNo}`}
                            onClick={() => handleMarkGroupAttendee(a.registrationId, "no-show")}
                            disabled={markingGroup}
                            title={a.status === "no-show" ? "Marked no-show" : "Mark no-show"}
                          >
                            ✕
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className={styles.panel} style={{ marginTop: 16 }}>
                <h2>Message the class</h2>
                <p className={styles.panelText}>
                  Sends this as an individual message to each registered student&apos;s own chat — not a shared
                  thread the class sees each other in. They&apos;ll reply to you normally from there.
                </p>
                <textarea
                  className={styles.input}
                  style={{ width: "100%", minHeight: 70, resize: "vertical", marginTop: 8 }}
                  value={broadcastText}
                  onChange={(e) => setBroadcastText(e.target.value)}
                  placeholder="Write a message to everyone registered for this class…"
                  disabled={broadcasting}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                  <button
                    className={styles.cta}
                    disabled={broadcasting || !broadcastText.trim()}
                    onClick={() => handleBroadcast(selectedGroupLesson.id)}
                  >
                    {broadcasting ? "Sending…" : "Send to class"}
                  </button>
                  {broadcastError && <span style={{ color: "#c0392b", fontSize: 13 }}>{broadcastError}</span>}
                  {broadcastResult && (
                    <span className={styles.panelText}>
                      Sent to {broadcastResult.sent}/{broadcastResult.total} students
                      {broadcastResult.failed.length > 0 && ` — couldn't reach: ${broadcastResult.failed.join(", ")}`}
                      .
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : !selectedId || !snapshot ? (
            <div className={styles.panel}>
              <p className={styles.panelText}>
                {loadingSnapshot ? "Loading…" : "Select a session or student to see their details here."}
              </p>
            </div>
          ) : (
            <div style={{ opacity: loadingSnapshot ? 0.6 : 1 }}>
              <div className={styles.scheduleHeadRow}>
                <h2 style={{ fontSize: 20, fontFamily: "var(--font-anton), sans-serif", fontWeight: 400 }}>
                  {snapshot.name}
                </h2>
                {selectedTodaySession && (
                  <span className={styles.panelText}>
                    <FormattedDateTime value={selectedTodaySession.scheduledAt} /> today
                  </span>
                )}
              </div>

              {snapshot.cancellationFlag && (
                <div
                  style={{
                    background: "rgba(232, 92, 134, 0.12)",
                    border: "1px solid rgba(232, 92, 134, 0.35)",
                    borderRadius: 10,
                    padding: "10px 12px",
                    marginBottom: 12,
                    fontSize: 13,
                  }}
                >
                  <p style={{ margin: 0, fontWeight: 700, color: "var(--coral)" }}>
                    ⚠ Flagged as cancelling
                  </p>
                  {snapshot.cancellationFlag.reason && (
                    <p style={{ margin: "4px 0 0" }}>&ldquo;{snapshot.cancellationFlag.reason}&rdquo;</p>
                  )}
                  <p className={styles.panelText} style={{ margin: "4px 0 0" }}>
                    Billing ends <FormattedDate value={snapshot.cancellationFlag.effectiveDate} /> — if you can talk
                    them into staying, let admin know.
                  </p>
                </div>
              )}

              <span className={styles.badge}>{TIER_LABEL[snapshot.tier] ?? snapshot.tier}</span>

              <div className={styles.snapshotGrid}>
                <div className={styles.snapshotStat}>
                  <div className={styles.snapshotStatLabel}>Sessions this cycle</div>
                  <div className={styles.snapshotStatValue}>
                    {snapshot.sessionsThisCycle}
                    {snapshot.sessionCycleCap ? ` of ${snapshot.sessionCycleCap} used` : ""}
                  </div>
                </div>
                <div className={styles.snapshotStat}>
                  <div className={styles.snapshotStatLabel}>Makeup credits</div>
                  <div className={styles.snapshotStatValue}>{snapshot.makeupCreditsAvailable} available</div>
                </div>
                <div className={styles.snapshotStat}>
                  <div className={styles.snapshotStatLabel}>Next session</div>
                  <div className={styles.snapshotStatValue}>
                    {snapshot.nextSession ? <FormattedDateTime value={snapshot.nextSession.scheduledAt} /> : "None scheduled"}
                  </div>
                </div>
                <div className={styles.snapshotStat}>
                  <div className={styles.snapshotStatLabel}>With you since</div>
                  <div className={styles.snapshotStatValue}>
                    {snapshot.withYouSince ? monthYear(snapshot.withYouSince, displayTimeZone) : "—"}
                  </div>
                </div>
                <div className={styles.snapshotStat}>
                  <div className={styles.snapshotStatLabel}>Age</div>
                  <div className={styles.snapshotStatValue}>{snapshot.age ?? "—"}</div>
                </div>
                <div className={styles.snapshotStat}>
                  <div className={styles.snapshotStatLabel}>Birthday</div>
                  <div className={styles.snapshotStatValue}>
                    {snapshot.birthDate ? formatPlainDate(snapshot.birthDate) : "—"}
                  </div>
                </div>
                <div className={styles.snapshotStat}>
                  <div className={styles.snapshotStatLabel}>Gender</div>
                  <div className={styles.snapshotStatValue}>{snapshot.gender ?? "—"}</div>
                </div>
                <div className={styles.snapshotStat}>
                  <div className={styles.snapshotStatLabel}>Location</div>
                  <div className={styles.snapshotStatValue}>
                    {[snapshot.city, snapshot.state, snapshot.country].filter(Boolean).join(", ") || "—"}
                  </div>
                </div>
              </div>

              <div className={styles.panel}>
                <h2>Homework Notes</h2>
                <NotesPanel studentId={snapshot.id} canAdd initialLimit={2} dark />
              </div>

              <div className={styles.panel}>
                <h2>Chat</h2>
                <ChatPanel studentId={snapshot.id} currentProfileId={currentProfileId} dark />
              </div>

              <div className={styles.panel}>
                <h2>Exercises</h2>
                <AssignExercisePanel
                  studentId={snapshot.id}
                  exercises={catalog}
                  assignedExerciseIds={assignedExercises.map((ex) => ex.exerciseId).filter((id): id is string => !!id)}
                  onAssigned={() => refreshAssignedExercises(snapshot.id)}
                />
                <AssignedExercisesList
                  assignedExercises={assignedExercises}
                  onUnassigned={() => refreshAssignedExercises(snapshot.id)}
                />
              </div>

              <div className={styles.panel}>
                <h2>Shared Folder</h2>
                {driveFolderId ? (
                  <SharedFolderPanel studentId={snapshot.id} />
                ) : (
                  <p className={styles.panelText}>No shared folder yet for this student.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
