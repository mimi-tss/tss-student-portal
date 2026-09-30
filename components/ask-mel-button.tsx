"use client";

import Link from "next/link";
import { BotMessageSquare } from "lucide-react";
import { useHelpPanel } from "@/components/help-panel";

// "Ask Mel" call-to-action for help pages inside a portal: opens the
// docked Mel panel when there is one, else goes to the /help/chat page.
export default function AskMelButton({ className }: { className?: string }) {
  const panel = useHelpPanel();
  const content = (
    <>
      <BotMessageSquare size={18} /> Ask Mel
    </>
  );
  if (!panel) {
    return (
      <Link href="/help/chat" className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={className} style={{ border: 0, cursor: "pointer" }} onClick={() => panel.state !== "open" && panel.toggle()}>
      {content}
    </button>
  );
}
