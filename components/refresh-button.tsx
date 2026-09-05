"use client";

// A one-click way to fully reload the page — the same fix "clear
// cookies and cache" already achieves (a fresh JS execution context),
// without walking someone through browser settings, and without
// actually touching cookies/auth (a plain reload, not a sign-out).
// Added for coaches specifically: a tab left open across a full day (or
// multiple days without logging out) can build up enough in-tab cruft
// in Chrome to feel sluggish — confirmed this isn't caused by anything
// in this app's own code (checked RLS query cost, Supabase client
// instantiation, chat history size, all against real production data
// and all ruled out) — it's a known long-lived-tab behavior Chrome hits
// harder than Safari. A full reload is the actual fix; this just makes
// it one click instead of a walkthrough.
export default function RefreshButton({ dark = false }: { dark?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      title="Feeling slow? Refresh the page."
      className={
        dark
          ? "rounded border border-[#2c2c3d] bg-[#20202f] px-2 py-1 text-xs text-[#9997ab] hover:text-[#f4f0e6]"
          : "rounded border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
      }
    >
      ↻ Refresh
    </button>
  );
}
