import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Your Coaching Studio — Tara Simon Studios",
  description: "Coach and student portal for Tara Simon Studios",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Applies a stored light-mode choice (components/theme-toggle.tsx)
            before first paint — without this, every page would flash
            dark, then swap to light a moment after hydration for anyone
            who'd picked light. Dark is still the default: this only ever
            adds data-theme="light", never anything for dark, since dark
            needs no override at all. Synchronous inline script, not
            next/script, specifically so it runs before paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
