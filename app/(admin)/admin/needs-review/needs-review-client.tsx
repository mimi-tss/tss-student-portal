"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { AttentionItem, AttentionKind, AttentionStatus } from "@/lib/admin/attention-items";
import { AttentionItemRow, KIND_LABEL, STATUS_TABS } from "../attention-item-row";
import styles from "../../admin.module.css";

export default function NeedsReviewClient() {
  const searchParams = useSearchParams();
  const kindFilter = searchParams.get("kind") as AttentionKind | null;
  const [tab, setTab] = useState<AttentionStatus>("needs_action");
  const [allItems, setAllItems] = useState<AttentionItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // One unfiltered fetch, not one per tab. `getAttentionItems` re-runs
  // the full condition-driven sync (6+ kinds, including the batched
  // recording-matching pass) on every call regardless of the status
  // filter — the previous load()+loadCounts() pair fired 4 separate
  // fetches on every page load (1 for the active tab, 3 more inside
  // loadCounts for all three tabs' counts), each redundantly re-running
  // that entire sync. Fetching every status once and deriving both the
  // visible list and the tab counts from it client-side cuts that to 1
  // sync per load, and makes switching tabs instant (no network round
  // trip) instead of triggering yet another one.
  function load() {
    setAllItems(null);
    setLoadError(null);
    fetch(`/api/admin/attention-items`)
      .then((res) => res.json())
      .then((data) => setAllItems(data.items ?? []))
      .catch(() => setLoadError("Couldn't load this list."));
  }

  useEffect(load, []);

  function handleChanged() {
    load();
  }

  const counts: Record<AttentionStatus, number> = {
    needs_action: 0,
    in_progress: 0,
    resolved: 0,
  };
  for (const item of allItems ?? []) counts[item.status]++;

  const tabItems = allItems ? allItems.filter((item) => item.status === tab) : null;
  const visibleItems = kindFilter ? (tabItems ?? []).filter((item) => item.kind === kindFilter) : tabItems;

  return (
    <div>
      {kindFilter && (
        <p className={styles.mutedText} style={{ marginBottom: 12 }}>
          Filtered to &ldquo;{KIND_LABEL[kindFilter] ?? kindFilter}&rdquo;.{" "}
          <Link href="/admin/needs-review" className={styles.linkBtnSmall}>
            Clear filter
          </Link>
        </p>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {STATUS_TABS.map((t) => (
          <button
            key={t.status}
            onClick={() => setTab(t.status)}
            className={tab === t.status ? styles.sidebarBtnActive : styles.sidebarBtn}
            style={{ width: "auto" }}
          >
            {t.label} ({counts[t.status]})
          </button>
        ))}
      </div>

      <div className={styles.panel}>
        {loadError && (
          <p className={styles.errorText}>
            {loadError}{" "}
            <button onClick={load} className={styles.linkBtnSmall}>
              Try again
            </button>
          </p>
        )}
        {!loadError && visibleItems === null && <p className={styles.mutedText}>Loading…</p>}
        {!loadError && visibleItems && visibleItems.length === 0 && (
          <p className={styles.emptyState}>Nothing here.</p>
        )}
        {!loadError &&
          visibleItems &&
          visibleItems.map((item) => <AttentionItemRow key={item.id} item={item} onChanged={handleChanged} />)}
      </div>
    </div>
  );
}
