import Link from "next/link";
import { requireRole } from "@/lib/auth/require-role";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { TimeZoneProvider } from "@/components/timezone-context";
import TimeZoneNavControl from "@/components/timezone-nav-control";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("admin");
  return (
    <TimeZoneProvider defaultZone={DEFAULT_TIMEZONE}>
      <div className="min-h-screen">
        <header className="border-b">
          <nav className="mx-auto flex max-w-3xl items-center gap-6 p-4">
            <Link href="/admin/dashboard" className="font-semibold">
              Students
            </Link>
            <Link href="/admin/schedules" className="text-gray-600 hover:text-black">
              Coach Schedules
            </Link>
            <TimeZoneNavControl />
          </nav>
        </header>
        {children}
      </div>
    </TimeZoneProvider>
  );
}
