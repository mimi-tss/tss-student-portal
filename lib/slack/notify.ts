// Best-effort Slack notification via an Incoming Webhook. A block should
// still succeed even if Slack is unreachable or SLACK_WEBHOOK_URL isn't
// set (e.g. local dev), so failures here are swallowed, never thrown.
//
// `webhookUrl` lets a caller target a channel other than the shared staff
// one — e.g. a coach's own per-coach channel (coaches.slack_webhook_url).
// Omitted, this falls back to SLACK_WEBHOOK_URL exactly as before, so
// every existing call site (coach-blocks, payroll notify-attendance,
// coach/blocks) keeps working unchanged.
export async function notifySlack(text: string, webhookUrl?: string) {
  const url = webhookUrl ?? process.env.SLACK_WEBHOOK_URL;
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
