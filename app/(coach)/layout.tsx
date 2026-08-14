import { requireRole } from "@/lib/auth/require-role";

export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("coach");
  return <div className="min-h-screen">{children}</div>;
}
