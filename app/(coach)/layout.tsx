import Link from "next/link";
import { requireRole } from "@/lib/auth/require-role";

export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("coach");
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <nav className="mx-auto flex max-w-3xl items-center gap-6 p-4">
          <Link href="/coach/dashboard" className="font-semibold">
            Dashboard
          </Link>
          <Link href="/coach/chat" className="text-gray-600 hover:text-black">
            Chat
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
