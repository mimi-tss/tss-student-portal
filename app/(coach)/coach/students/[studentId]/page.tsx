import { redirect } from "next/navigation";

// Superseded by the Dashboard's inline student detail panel — this
// deep-link (e.g. from an older chat notification) redirects there
// instead of duplicating the snapshot/notes/chat/exercises/folder UI in
// a second standalone page.
export default async function CoachStudentRedirect({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  redirect(`/coach/dashboard?student=${studentId}`);
}
