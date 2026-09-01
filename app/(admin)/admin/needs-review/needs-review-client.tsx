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
  const [items, setItems] = useState<AttentionItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<AttentionStatus, number>>({
    needs_action: 0,
    in_progress: 0,
    resolved: 0,
  });

  // Neither fetch had a .catch before this — a failed request (a 500,
  // a timeout, anything that doesn't come back as parseable JSON) left
  // `items` stuck at null and the page showing "Loading…" forever, with
  // no error and no way to retry short of a full page reload.
  function load() {
    setItems(null);
    setLoadError(null);
    fetch(`/api/admin/attention-items?status=${tab}`)
      .then((res) => res.json())
      .then((data) => setItems(data.items ?? []))
      .catch(() => setLoadError("Couldn't load this list."));
  }

  function loadCounts() {
    Promise.all(
      STATUS_TABS.map((t) =>
        fetch(`/api/admin/attention-items?status=${t.status}`)
          .then((res) => res.json())
          .then((data) => [t.status, (data.items ?? []).length] as const),
      ),
    )
      .then((results) => setCounts(Object.fromEntries(results) as Record<AttentionStatus, number>))
      .catch(() => {});
  }

  useEffect(load, [tab]);
  useEffect(loadCounts, []);

  function handleChanged() {
    load();
    loadCounts();
  }

  const visibleItems = kindFilter ? (items ?? []).filter((item) => item.kind === kindFilter) : items;

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
