"use client";

import Link from "next/link";
import { BotMessageSquare } from "lucide-react";
import { useHelpPanel } from "@/components/help-panel";

const CLASSES =
  "relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]";

// Opens/closes Mel, the AI help chat, from the student header — same round
// icon-button look as the notification bell next to it. Inside the
// portal it toggles the docked panel (components/help-panel.tsx); without
// the panel provider it falls back to the /help/chat page.
export default function HelpAgentButton() {
  const panel = useHelpPanel();

  if (!panel) {
    return (
      <Link href="/help/chat" aria-label="Chat with Mel, the AI assistant" title="Need help? Chat with Mel" className={CLASSES}>
        <BotMessageSquare size={18} strokeWidth={2} />
      </Link>
    );
  }

  const active = panel.state === "open";
  return (
    <button
      type="button"
      onClick={panel.toggle}
      aria-label={active ? "Close chat with Mel" : "Chat with Mel, the AI assistant"}
      aria-pressed={active}
      title="Need help? Chat with Mel"
      className={CLASSES}
      style={active ? { background: "var(--gold)", color: "var(--gold-text)", borderColor: "var(--gold)" } : undefined}
    >
      <BotMessageSquare size={18} strokeWidth={2} />
    </button>
  );
}
