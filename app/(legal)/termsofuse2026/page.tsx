import type { Metadata } from "next";
import { TERMS_MARKDOWN, TERMS_UPDATED } from "@/lib/legal/terms";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = {
  title: "Terms of Use — Sing Smarter by Tara Simon Studios",
  description: "Terms of Use for the Sing Smarter app, student portal and Tara Simon Studios services.",
};

export default function TermsOfUsePage() {
  return <LegalPage title="Sing Smarter Terms of Use" updated={TERMS_UPDATED} markdown={TERMS_MARKDOWN} />;
}
