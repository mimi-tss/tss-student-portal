import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BookingClient from "./booking-client";

// Booking/reschedule flow — deliberately its own route, separate from
// /student/dashboard, so it can be linked to directly (e.g. from a
// reschedule notification) without loading the full dashboard. Still inside
// the (student) route group, so it shares the same Supabase auth session
// and backend as the rest of the portal.
export default async function BookPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: student } = await supabase
    .from("students")
    .select("id, assigned_coach_id")
    .eq("profile_id", user.id)
    .single();

  if (!student) redirect("/login");

  return <BookingClient studentId={student.id} coachId={student.assigned_coach_id} />;
}
