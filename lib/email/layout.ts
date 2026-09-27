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
  | { type: "note"; text: string }
  | { type: "h2"; text: string }
  | { type: "list"; items: string[] }
  | { type: "link"; label: string; url: string }
  | {
      type: "feature";
      heading?: string | null;
      body?: string | null;
      imageUrl?: string | null;
      button?: { label: string; url: string } | null;
    };

export interface EmailContent {
  preheader: string;
  heading: string;
  blocks: EmailBlock[];
  // One line saying why they got this — required by good sending
  // practice and it cuts spam complaints ("You're getting this because
  // lesson reminders are on.").
  reason: string;
  // Replaces the default "Questions? Just reply…" footer line; "" drops
  // it. For emails where replying by email is the wrong move (chat:
  // replies land in the studio's info@ inbox, not with the coach).
  replyLine?: string;
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
    case "feature": {
      // Studio-written box: heading, then the image as a thumbnail, then
      // body (line breaks kept), then button. Every part optional.
      const parts = [
        b.heading ? `<p style="margin:0 0 12px;font:bold 20px/1.3 ${FONT};color:${COLOR.text};">${esc(b.heading)}</p>` : "",
        b.imageUrl
          ? `<img src="${esc(b.imageUrl)}" width="240" alt="${esc(b.heading ?? "")}" style="display:block;width:240px;max-width:100%;height:auto;border:0;border-radius:10px;margin:0 0 14px;">`
          : "",
        b.body
          ? `<p style="margin:0 0 16px;font:16px/1.55 ${FONT};color:${COLOR.text};">${esc(b.body).replace(/\n/g, "<br>")}</p>`
          : "",
        b.button ? blockHtml({ type: "button", label: b.button.label, url: b.button.url }) : "",
      ].filter(Boolean);
      return `<div style="margin:28px 0 8px;padding-top:24px;border-top:1px solid ${COLOR.border};">${parts.join("\n")}</div>`;
    }
    case "link":
      return `<p style="margin:0 0 16px;font:bold 15px/1.5 ${FONT};"><a href="${esc(b.url)}" target="_blank" style="color:${COLOR.accent};text-decoration:underline;">${esc(b.label)}</a></p>`;
    case "h2":
      return `<p style="margin:28px 0 10px;padding-top:20px;border-top:1px solid ${COLOR.border};font:bold 12px/1.4 ${FONT};letter-spacing:1px;text-transform:uppercase;color:${COLOR.accent};">${esc(b.text)}</p>`;
    case "list":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;">
  ${b.items.map((it) => `<tr><td style="padding:0 0 8px;font:15px/1.5 ${FONT};color:${COLOR.text};">${rich(it)}</td></tr>`).join("\n  ")}
</table>`;
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
    case "h2":
      return b.text.toUpperCase();
    case "link":
      return `${b.label}: ${b.url}`;
    case "feature":
      return [b.heading?.toUpperCase(), b.body, b.button ? `${b.button.label}: ${b.button.url}` : null]
        .filter(Boolean)
        .join("\n");
    case "list":
      return b.items.map((it) => `- ${plain(it)}`).join("\n");
  }
}

export function renderEmail(c: EmailContent): { html: string; text: string } {
  const prefsUrl = appUrl("/billing/account");
  // 120px source shown at 40px — crisp on retina screens.
  const logoUrl = appUrl("/email-logo.png");

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
          <td style="vertical-align:middle;padding-right:10px;"><img src="${logoUrl}" width="40" height="40" alt="Tara Simon Studios" style="display:block;border:0;"></td>
          <td style="vertical-align:middle;font:18px/1 ${DISPLAY_FONT};letter-spacing:2px;text-transform:uppercase;color:${COLOR.text};">Tara Simon Studios</td>
        </tr></table>
      </td></tr>
      <tr><td style="background:${COLOR.card};border-radius:16px;border:1px solid ${COLOR.border};padding:36px 32px 12px;">
        <h1 style="margin:0 0 20px;font:bold 24px/1.3 ${FONT};color:${COLOR.text};">${esc(c.heading)}</h1>
        ${c.blocks.map(blockHtml).join("\n        ")}
      </td></tr>
      <tr><td style="padding:24px 16px 0;font:13px/1.6 ${FONT};color:${COLOR.muted};text-align:center;">
        ${c.replyLine === undefined ? "Questions? Just reply to this email &mdash; it goes straight to the studio.<br>" : c.replyLine ? `${esc(c.replyLine)}<br>` : ""}
        ${esc(c.reason)} <a href="${prefsUrl}" style="color:${COLOR.muted};text-decoration:underline;">Manage notifications</a><br>
        Tara Simon Studios &middot; Your Voice Matters!
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
    ...(c.replyLine === undefined ? ["Questions? Just reply to this email."] : c.replyLine ? [c.replyLine] : []),
    `${c.reason} Manage notifications: ${prefsUrl}`,
    "Tara Simon Studios · Your Voice Matters!",
  ].join("\n");

  return { html, text };
}

// SMS copy helper — branded up front by default. No opt-out line here:
// GHL appends its own STOP/opt-out text to every outgoing SMS, so adding
// one would show it twice. Warns in dev if the text plus GHL's line
// (~30 chars reserved) would split into multiple 160-char segments.
const GHL_OPT_OUT_RESERVE = 30;

// One non-GSM character (curly quote, ellipsis, em dash, emoji) switches
// the WHOLE text to UCS-2, where a segment is 70 chars instead of 160 —
// a normal reminder would bill as 3 texts. Coaches type curly quotes
// from phones all the time, so flatten them; strip anything else exotic.
function toGsm(s: string): string {
  return s
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/[^\n\r -~£¥èéùìòÇØøÅåÄÖÑÜ§äöñüà¡¿]/g, "");
}

export function smsText(body: string, opts: { brandPrefix?: boolean } = {}): string {
  // brandPrefix: false when the copy already reads as coming from the
  // studio (texts send from the studio's own GHL number either way).
  const s = toGsm(`${opts.brandPrefix === false ? "" : "Tara Simon Studios: "}${body}`);
  if (s.length + GHL_OPT_OUT_RESERVE > 160 && process.env.NODE_ENV !== "production") {
    console.warn(`SMS likely over one segment (${s.length} + GHL opt-out): ${s}`);
  }
  return s;
}
