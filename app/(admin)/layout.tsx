import Link from "next/link";
import { requireRole } from "@/lib/auth/require-role";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("admin");
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <nav className="mx-auto flex max-w-3xl items-center gap-6 p-4">
          <Link href="/admin/dashboard" className="font-semibold">
            Students
          </Link>
          <Link href="/admin/schedules" className="text-gray-600 hover:text-black">
            Coach Schedules
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
