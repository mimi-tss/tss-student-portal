/** @type {import('next').NextConfig} */
const nextConfig = {
  // Nothing embeds this app by default (no X-Frame-Options was ever set,
  // so it was accidentally iframe-able by *anyone* until now) — this
  // makes that a deliberate, narrow allowance instead: only this app's
  // own origin and the studio's Kajabi site (NEXT_PUBLIC_KAJABI_SITE_URL,
  // same var already used for the Courses/Community nav links) may frame
  // it. Needed so a Kajabi Library Card's Custom Code block can embed a
  // dashboard route directly via <iframe> — see PROGRESS.md.
  async headers() {
    const kajabiSite = process.env.NEXT_PUBLIC_KAJABI_SITE_URL;
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors 'self'${kajabiSite ? ` ${kajabiSite}` : ""}`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
