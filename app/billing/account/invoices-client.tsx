"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/stripe/tiers";
import styles from "../billing.module.css";

interface Invoice {
  id: string;
  date: string | null;
  amountPaid: number;
  currency: string;
  status: string | null;
  pdfUrl: string | null;
  hostedUrl: string | null;
}

export default function InvoicesClient() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);

  useEffect(() => {
    fetch("/api/billing/invoices")
      .then((res) => res.json())
      .then((data) => setInvoices(data.invoices ?? []))
      .catch(() => setInvoices([]));
  }, []);

  if (invoices === null) return null;
  if (invoices.length === 0) return null;

  return (
    <div className={styles.card} style={{ maxWidth: 480, marginBottom: 24, textAlign: "left" }}>
      <div className={styles.tierName} style={{ marginBottom: 12 }}>
        Invoices
      </div>
      {invoices.map((inv) => (
        <div key={inv.id} className={styles.statRow}>
          <span className={styles.statLabel}>
            {inv.date ? new Date(inv.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
            {" · "}
            {formatPrice(inv.amountPaid, inv.currency)}
          </span>
          {inv.pdfUrl ? (
            <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" className={styles.linkBtn}>
              Download
            </a>
          ) : (
            <span>—</span>
          )}
        </div>
      ))}
    </div>
  );
}
