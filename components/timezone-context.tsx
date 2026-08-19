"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { DEFAULT_TIMEZONE, detectTimezone } from "@/lib/timezones";

const STORAGE_KEY = "tss-display-timezone";

const TimeZoneContext = createContext<{
  timeZone: string;
  setTimeZone: (tz: string) => void;
} | null>(null);

// Every screen's display timezone comes from here — defaults to the
// studio's own zone (Eastern) for admin/coach, or the viewer's detected
// local zone for students (see `autoDetect`), and is always overridable
// via the timezone selector in the header. Persisted per-browser in
// localStorage, not per-account — there's no server-side profile field
// for this, and a device-local preference is enough for a v1.
//
// `autoDetect=true` (student layout only) starts from the browser's own
// zone rather than the studio default. The server always renders
// `defaultZone` first (it can't know the browser's zone), then this
// swaps to the detected zone right after mount if the user hasn't
// picked an explicit override — a one-frame correction, not a
// hydration mismatch, since the client's *first* render matches the
// server's.
export function TimeZoneProvider({
  defaultZone,
  autoDetect = false,
  children,
}: {
  defaultZone: string;
  autoDetect?: boolean;
  children: React.ReactNode;
}) {
  const [timeZone, setTimeZoneState] = useState(defaultZone);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setTimeZoneState(stored);
      return;
    }
    if (autoDetect) {
      setTimeZoneState(detectTimezone());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setTimeZone(tz: string) {
    setTimeZoneState(tz);
    window.localStorage.setItem(STORAGE_KEY, tz);
  }

  return (
    <TimeZoneContext.Provider value={{ timeZone, setTimeZone }}>
      {children}
    </TimeZoneContext.Provider>
  );
}

export function useTimeZone(): { timeZone: string; setTimeZone: (tz: string) => void } {
  const ctx = useContext(TimeZoneContext);
  if (!ctx) {
    return { timeZone: DEFAULT_TIMEZONE, setTimeZone: () => {} };
  }
  return ctx;
}
