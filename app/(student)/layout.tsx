import { requireRole } from "@/lib/auth/require-role";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("student");
  return <div className="min-h-screen">{children}</div>;
}
