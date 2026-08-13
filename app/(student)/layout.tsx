// TODO: gate this route group to users with profiles.role === "student"
export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen">{children}</div>;
}
