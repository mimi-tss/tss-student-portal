import type { Metadata } from "next";
import { PRIVACY_MARKDOWN, PRIVACY_UPDATED } from "@/lib/legal/privacy";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy — Sing Smarter by Tara Simon Studios",
  description: "How Tara Simon Studios collects, uses and protects your information.",
};

export default function PrivacyPolicyPage() {
  return <LegalPage title="Sing Smarter Privacy Policy" updated={PRIVACY_UPDATED} markdown={PRIVACY_MARKDOWN} />;
}
