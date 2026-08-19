import Link from "next/link";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { TimeZoneProvider } from "@/components/timezone-context";
import TimeZoneNavControl from "@/components/timezone-nav-control";

export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("coach");

  // Defaults the view to the coach's own configured zone (they live and
  // work in it — TSS_App_Spec_1.md section 8), not the studio's Eastern
  // default — still changeable via the header selector like everywhere
  // else.
  const supabase = await createClient();
  const { data: coach } = await supabase
    .from("coaches")
    .select("timezone")
    .eq("profile_id", user.id)
    .maybeSingle();

  return (
    <TimeZoneProvider defaultZone={coach?.timezone ?? DEFAULT_TIMEZONE}>
      <div className="min-h-screen">
        <header className="border-b">
          <nav className="mx-auto flex max-w-3xl items-center gap-6 p-4">
            <Link href="/coach/dashboard" className="font-semibold">
              Dashboard
            </Link>
            <Link href="/coach/chat" className="text-gray-600 hover:text-black">
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
