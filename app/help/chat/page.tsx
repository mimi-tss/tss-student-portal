import type { Metadata } from "next";
import HelpChat from "../help-chat";
import styles from "../help.module.css";

export const metadata: Metadata = { title: "Chat with Mel — Tara Simon Studios" };

// Mel, the AI help chat, as a full page — for logged-out students, the
// login page's "Chat with us" link and the help center's "Ask Mel"
// buttons. Inside the portal the same chat opens as a side panel
// (components/help-panel.tsx). Works logged out (general + login help)
// and logged in (the student's own lessons, credits, settings); a person
// takes over from /admin/support when needed.
export default function HelpChatPage() {
  return (
    <div className={styles.root}>
      <HelpChat />
    </div>
  );
}
