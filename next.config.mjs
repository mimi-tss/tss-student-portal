/** @type {import('next').NextConfig} */
const nextConfig = {
  // Nothing embeds this app by default (no X-Frame-Options was ever set,
  // so it was accidentally iframe-able by *anyone* until now) — this
  // makes that a deliberate, narrow allowance instead: only this app's
  // own origin, the studio's Kajabi site (NEXT_PUBLIC_KAJABI_SITE_URL,
  // same var already used for the Courses/Community nav links), and
  // Kajabi's own app.kajabi.com may frame it. app.kajabi.com is a
  // separate origin from the studio's own site — it's where the Branded
  // App's screen builder previews an Embed Code widget (confirmed live:
  // without this, that preview showed "portal.tarasimonstudios.com
  // refused to connect", this CSP correctly doing exactly what its own
  // comment says). Needed so a Kajabi Library Card's Custom Code block
  // OR a Branded App Custom Screen's Embed Code widget can embed a
  // dashboard route directly via <iframe> — see PROGRESS.md. Whether the
  // real native Branded App (not just this admin-side builder preview)
  // loads the widget through this same app.kajabi.com origin, a
  // different one, or bypasses browser CSP entirely (native WebViews
  // don't always enforce it) is still unconfirmed — flagged as a real
  // unknown, not assumed; if the live app on a real phone still shows a
  // refused-connection/blank iframe once this deploys, that means a
  // different origin needs adding here instead.
  async headers() {
    const kajabiSite = process.env.NEXT_PUBLIC_KAJABI_SITE_URL;
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors 'self' https://app.kajabi.com${kajabiSite ? ` ${kajabiSite}` : ""}`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
