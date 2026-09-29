"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { BotMessageSquare } from "lucide-react";
import HelpChat from "@/app/help/help-chat";

// Mel, the AI help chat, docked inside the student portal (like Kajabi's
// side assistant):
//  - Desktop (>= 900px): a panel on the right; the page shrinks so the
//    student can keep working next to the chat.
//  - Phone: a full-screen sheet with Minimize -> a floating Mel bubble in
//    the corner (dot = new reply) that reopens it in one tap.
// Lives in the (student) layout, so it stays open while the student moves
// between portal pages; state also survives full reloads (sessionStorage).
// /help remains the standalone page (logged-out guests, the login page
// link, the Kajabi app menu).

type PanelState = "closed" | "open" | "minimized";
const STORAGE_KEY = "tss_help_panel";
const PANEL_WIDTH = 400;
const DESKTOP_QUERY = "(min-width: 900px)";

const HelpPanelContext = createContext<{ toggle: () => void; state: PanelState } | null>(null);

export function useHelpPanel() {
  return useContext(HelpPanelContext);
}

function readState(): PanelState {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    return v === "open" || v === "minimized" ? v : "closed";
  } catch {
    return "closed";
  }
}

export function HelpPanelProvider({ children }: { children: React.ReactNode }) {
  const [state, setStateRaw] = useState<PanelState>("closed");
  const [desktop, setDesktop] = useState(false);
  const [unread, setUnread] = useState(false);
  const seenCountRef = useRef<number | null>(null);

  const setState = useCallback((next: PanelState) => {
    setStateRaw(next);
    try {
      sessionStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage blocked — state just won't survive a reload
    }
    if (next === "open") setUnread(false);
  }, []);

  useEffect(() => {
    setStateRaw(readState());
    const mq = window.matchMedia(DESKTOP_QUERY);
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const toggle = useCallback(() => setState(state === "open" ? "closed" : "open"), [state, setState]);

  const onMessageCount = useCallback(
    (count: number) => {
      if (state === "open" || seenCountRef.current === null) seenCountRef.current = count;
      else if (count > seenCountRef.current) setUnread(true);
    },
    [state],
  );

  const docked = desktop && state === "open";

  return (
    <HelpPanelContext.Provider value={{ toggle, state }}>
      <div style={{ marginRight: docked ? PANEL_WIDTH : 0, transition: "margin-right 0.2s ease" }}>{children}</div>

      {state !== "closed" && (
        <div
          // Kept mounted while minimized so the conversation (and polling
          // for the team's replies) carries on in the background.
          style={
            state === "open"
              ? desktop
                ? {
                    position: "fixed",
                    top: 0,
                    right: 0,
                    bottom: 0,
                    width: PANEL_WIDTH,
                    zIndex: 60,
                    borderLeft: "1px solid var(--border)",
                    boxShadow: "-12px 0 32px rgba(0,0,0,0.25)",
                  }
                : { position: "fixed", inset: 0, zIndex: 60 }
              : { display: "none" }
          }
          role="dialog"
          aria-label="Mel, the AI assistant"
        >
          <HelpChat
            variant="panel"
            onMinimize={() => setState("minimized")}
            onClose={() => setState("closed")}
            onMessageCount={onMessageCount}
          />
        </div>
      )}

      {state === "minimized" && (
        <button
          type="button"
          onClick={() => setState("open")}
          aria-label={unread ? "Open chat with Mel — new reply" : "Open chat with Mel"}
          style={{
            position: "fixed",
            right: 16,
            bottom: "max(16px, env(safe-area-inset-bottom))",
            zIndex: 60,
            width: 56,
            height: 56,
            borderRadius: 999,
            border: "none",
            background: "var(--gold)",
            color: "var(--gold-text)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            cursor: "pointer",
          }}
        >
          <BotMessageSquare size={26} />
          {unread && (
            <span
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                width: 14,
                height: 14,
                borderRadius: 999,
                background: "var(--coral)",
                border: "2px solid var(--bg)",
              }}
            />
          )}
        </button>
      )}
    </HelpPanelContext.Provider>
  );
}
