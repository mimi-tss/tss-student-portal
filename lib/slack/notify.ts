// Best-effort Slack notification via an Incoming Webhook. A block should
// still succeed even if Slack is unreachable or SLACK_WEBHOOK_URL isn't
// set (e.g. local dev), so failures here are swallowed, never thrown.
export async function notifySlack(text: string) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    // swallow — Slack delivery is not a hard requirement
  }
}
