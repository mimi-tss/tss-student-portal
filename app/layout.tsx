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
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
