// Shared branded layout for every student-facing email. Email clients
// ignore most modern CSS (Gmail strips <style> in places, Outlook renders
// with Word), so this is deliberately old-school: nested tables, inline
// styles, web-safe fonts, a "bulletproof" table button. Every email also
// ships a plain-text version built from the same blocks — HTML-only mail
// is a spam signal, and the text part is what some watches/clients show.
//
// Palette is the portal's light theme (app/theme-tokens.module.css), so
// an email looks like it came from the same place the button opens.

const COLOR = {
  pageBg: "#eeecf3",
  card: "#ffffff",
  text: "#201d2b",
  muted: "#6b6878",
  accent: "#6d4fd1",
  accentSoft: "#f3effd",
  border: "#e4e1ec",
};

const FONT = "Helvetica, Arial, sans-serif";
const DISPLAY_FONT = "Anton, Impact, 'Arial Narrow Bold', Helvetica, Arial, sans-serif";

export type EmailBlock =
  | { type: "p"; text: string }
  | { type: "card"; title?: string; lines: string[] }
  | { type: "quote"; text: string; from: string }
  | { type: "button"; label: string; url: string }
  | { type: "note"; text: string };

export interface EmailContent {
  preheader: string;
  heading: string;
  blocks: EmailBlock[];
  // One line saying why they got this — required by good sending
  // practice and it cuts spam complaints ("You're getting this because
  // lesson reminders are on.").
  reason: string;
}

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Escapes, then turns **bold** into <strong> — the only formatting
// templates need, and it keeps template copy readable.
function rich(s: string): string {
  return esc(s).replace(/\*\*(.+?)\*\*/g, `<strong style="color:${COLOR.text};">$1</strong>`);
}

function plain(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, "$1");
}

function appUrl(path = ""): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.tarasimonstudios.com"}${path}`;
}

function blockHtml(b: EmailBlock): string {
  switch (b.type) {
    case "p":
      return `<p style="margin:0 0 16px;font:16px/1.55 ${FONT};color:${COLOR.text};">${rich(b.text)}</p>`;
    case "note":
      return `<p style="margin:0 0 16px;font:14px/1.5 ${FONT};color:${COLOR.muted};">${rich(b.text)}</p>`;
    case "card":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;">
  <tr><td style="background:${COLOR.accentSoft};border-left:4px solid ${COLOR.accent};border-radius:10px;padding:16px 20px;">
    ${b.title ? `<p style="margin:0 0 6px;font:bold 12px/1.4 ${FONT};letter-spacing:1px;text-transform:uppercase;color:${COLOR.accent};">${esc(b.title)}</p>` : ""}
    ${b.lines.map((l, i) => `<p style="margin:0;font:${i === 0 ? "bold 18px/1.45" : "15px/1.5"} ${FONT};color:${COLOR.text};">${rich(l)}</p>`).join("\n    ")}
  </td></tr>
</table>`;
    case "quote":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;">
  <tr><td style="background:${COLOR.accentSoft};border-radius:10px;padding:16px 20px;">
    <p style="margin:0 0 8px;font:italic 16px/1.55 ${FONT};color:${COLOR.text};">&ldquo;${esc(b.text)}&rdquo;</p>
    <p style="margin:0;font:13px/1.4 ${FONT};color:${COLOR.muted};">&mdash; ${esc(b.from)}</p>
  </td></tr>
</table>`;
    case "button":
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
  <tr><td align="center" bgcolor="${COLOR.accent}" style="border-radius:999px;">
    <a href="${esc(b.url)}" target="_blank" style="display:inline-block;padding:14px 28px;font:bold 16px/1 ${FONT};color:#ffffff;text-decoration:none;border-radius:999px;">${esc(b.label)}</a>
  </td></tr>
</table>`;
  }
}

function blockText(b: EmailBlock): string {
  switch (b.type) {
    case "p":
    case "note":
      return plain(b.text);
    case "card":
      return [b.title?.toUpperCase(), ...b.lines.map(plain)].filter(Boolean).join("\n");
    case "quote":
      return `"${b.text}"\n— ${b.from}`;
    case "button":
      return `${b.label}: ${b.url}`;
  }
}

export function renderEmail(c: EmailContent): { html: string; text: string } {
  const prefsUrl = appUrl("/billing/account");
  const logoUrl = appUrl("/logo.png");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(c.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.pageBg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COLOR.pageBg};">${esc(c.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.pageBg};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
      <tr><td style="padding:0 8px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="vertical-align:middle;padding-right:10px;"><img src="${logoUrl}" width="22" height="32" alt="" style="display:block;border:0;"></td>
          <td style="vertical-align:middle;font:18px/1 ${DISPLAY_FONT};letter-spacing:2px;text-transform:uppercase;color:${COLOR.text};">Tara Simon Studios</td>
        </tr></table>
      </td></tr>
      <tr><td style="background:${COLOR.card};border-radius:16px;border:1px solid ${COLOR.border};padding:36px 32px 12px;">
        <h1 style="margin:0 0 20px;font:bold 24px/1.3 ${FONT};color:${COLOR.text};">${esc(c.heading)}</h1>
        ${c.blocks.map(blockHtml).join("\n        ")}
      </td></tr>
      <tr><td style="padding:24px 16px 0;font:13px/1.6 ${FONT};color:${COLOR.muted};text-align:center;">
        Questions? Just reply to this email &mdash; it goes straight to the studio.<br>
        ${esc(c.reason)} <a href="${prefsUrl}" style="color:${COLOR.muted};text-decoration:underline;">Manage notifications</a><br>
        Tara Simon Studios &middot; Private voice coaching
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    c.heading,
    "",
    ...c.blocks.flatMap((b) => [blockText(b), ""]),
    "—",
    "Questions? Just reply to this email.",
    `${c.reason} Manage notifications: ${prefsUrl}`,
    "Tara Simon Studios · Private voice coaching",
  ].join("\n");

  return { html, text };
}

// SMS copy helper — always branded up front, always the opt-out at the
// end (carrier/A2P requirement), and warns in dev if it'd split into
// multiple segments (160 GSM chars).
export function smsText(body: string): string {
  const s = `Tara Simon Studios: ${body} Reply STOP to opt out`;
  if (s.length > 160 && process.env.NODE_ENV !== "production") {
    console.warn(`SMS over one segment (${s.length} chars): ${s}`);
  }
  return s;
}
