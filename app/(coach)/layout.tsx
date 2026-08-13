// TODO: gate this route group to users with profiles.role === "coach"
export default function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen">{children}</div>;
}
