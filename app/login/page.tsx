const ERROR_MESSAGES: Record<string, string> = {
  not_logged_in: "Please log in from your portal link to continue.",
  unauthorized: "You don't have access to that page.",
  missing_token: "That link is missing its login token.",
  expired_link: "That login link has expired or was already used — request a new one.",
  student_not_found: "We couldn't find your account.",
  session_failed: "Something went wrong creating your session — try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? ERROR_MESSAGES[error] : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-24 text-center">
      <h1 className="text-xl font-semibold">Log in</h1>
      {message && <p className="max-w-sm text-sm text-red-600">{message}</p>}
      <p className="max-w-sm text-sm text-gray-500">
        There's no password here — check your email for your portal link, or
        contact the studio if you need a new one.
      </p>
    </main>
  );
}
