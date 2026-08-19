import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { TimeZoneProvider } from "@/components/timezone-context";
import TimeZoneNavControl from "@/components/timezone-nav-control";

// Portal access scales with tier (TSS_App_Spec_1.md section 2) — Lite
// gets none at all. requireRole only confirms "this is a student
// account"; this checks whether that student's current tier is even
// allowed in here.
export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("student");

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("tier")
    .eq("profile_id", user.id)
    .single();

  if (!student || student.tier === "lite") {
    redirect("/login?error=no_portal_access");
  }

  return (
    <TimeZoneProvider defaultZone={DEFAULT_TIMEZONE} autoDetect>
      <div className="min-h-screen">
        <header className="border-b">
          <nav className="mx-auto flex max-w-2xl items-center gap-6 p-4">
            <Link href="/student/dashboard" className="font-semibold">
              Studio
            </Link>
            <Link href="/student/book" className="text-gray-600 hover:text-black">
              Book / reschedule
            </Link>
            <Link href="/student/chat" className="text-gray-600 hover:text-black">
              Chat
            </Link>
            <TimeZoneNavControl />
          </nav>
        </header>
        {children}
      </div>
    </TimeZoneProvider>
  );
}
