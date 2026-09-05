"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Stronger sibling to RefreshButton, for the actual failure a plain
// reload doesn't fix: a coach's screen going fully blank inside the
// Kajabi iframe after ~2 days without logging out (confirmed live via
// screen recording — Chrome specifically, "My Students" going to a
// black void that a plain reload didn't recover from, matching her own
// report that manually reloading multiple times "is still the issue").
// A plain reload reuses whatever's already stored — if the real problem
// is the coach's own session/cookie state, reusing it just reproduces
// the same blank screen. This explicitly signs out (Supabase's own
// signOut(), which clears its auth cookies through the same storage
// adapter that set them — scoped to just this app's session, not a
// blanket "wipe all site data" the way manually clearing cookies is),
// then sends her to a fresh login. Confirmed live that manually clearing
// cookies fixes this exact case — this is that same fix as one click
// instead of a browser-settings walkthrough, deliberately kept separate
// from RefreshButton rather than folding into it, since this one forces
// a real re-login and shouldn't fire for ordinary sluggishness a plain
// reload would've resolved.
export default function SessionResetButton() {
  const [working, setWorking] = useState(false);

  async function handleClick() {
    if (
      !window.confirm(
        "This will sign you out and take you back to the login screen — use this if your screen is stuck blank or won't load. Continue?",
      )
    ) {
      return;
    }
    setWorking(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={working}
      title="Screen stuck or blank? This signs you out and back to login — fixes it."
      // Fallback values, not a bare var() — also renders inside
      // app/global-error.tsx and components/dashboard-error.tsx (Next's
      // error-boundary fallbacks, outside any layout's themed .root div,
      // see RefreshButton's identical comment).
      className="rounded border border-[var(--border,#2c2c3d)] bg-[var(--surface-2,#20202f)] px-2 py-1 text-xs text-[var(--text-muted,#9997ab)] hover:text-[var(--text,#f4f0e6)] disabled:opacity-50"
    >
      {working ? "Fixing…" : "Fix stuck screen"}
    </button>
  );
}
