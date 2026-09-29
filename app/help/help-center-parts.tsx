import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { BotMessageSquare } from "lucide-react";
import styles from "./center.module.css";

// Shared bits of the public help center pages.

export function HelpTopbar() {
  return (
    <header className={styles.topbar}>
      <Link href="/help" className={styles.brand}>
        <img src="/logo.png" alt="" />
        <span className={styles.brandName}>Help center</span>
      </Link>
      <a href="/student/dashboard" className={styles.topLink}>
        Portal
      </a>
      <Link href="/help/chat" className={styles.askBtn}>
        <BotMessageSquare size={18} /> Ask Mel
      </Link>
    </header>
  );
}

export function AskMelPanel({ text = "Still stuck?" }: { text?: string }) {
  return (
    <div className={styles.panel}>
      <strong>{text}</strong>
      <p className={styles.muted} style={{ margin: "4px 0 0" }}>
        Mel, the studio&apos;s AI assistant, can look at your lessons and account and help right away.
      </p>
      <div className={styles.row}>
        <Link href="/help/chat" className={styles.askBtn}>
          <BotMessageSquare size={18} /> Ask Mel
        </Link>
      </div>
    </div>
  );
}

// Article Markdown -> HTML. No raw HTML allowed (react-markdown's
// default), links to other sites open in a new tab.
export function ArticleBody({ markdown }: { markdown: string }) {
  return (
    <div className={styles.prose}>
      <ReactMarkdown
        components={{
          a: ({ href, children }) => {
            const external = !!href && /^https?:\/\//.test(href) && !href.includes("tarasimonstudios.com");
            return (
              <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                {children}
              </a>
            );
          },
          // eslint-disable-next-line @next/next/no-img-element
          img: ({ src, alt }) => <img src={typeof src === "string" ? src : ""} alt={alt ?? ""} loading="lazy" />,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
