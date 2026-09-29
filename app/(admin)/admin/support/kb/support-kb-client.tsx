"use client";

import { useState } from "react";
import type { SupportSettings } from "@/lib/support/settings";
import styles from "../../../admin.module.css";

export interface KbArticle {
  id: string;
  category: string;
  title: string;
  body: string;
  active: boolean;
  sort_order: number;
}

const CATEGORIES: [string, string][] = [
  ["login", "Login"],
  ["scheduling", "Scheduling"],
  ["portal", "Portal"],
  ["kajabi-courses", "Kajabi courses"],
  ["kajabi-community", "Kajabi community (Backstage)"],
  ["billing", "Billing"],
  ["other", "Other"],
];
const DAYS: [string, string][] = [
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
  ["sun", "Sun"],
];

const EMPTY: Omit<KbArticle, "id"> = { category: "portal", title: "", body: "", active: true, sort_order: 100 };

async function post(payload: Record<string, unknown>) {
  const res = await fetch("/api/admin/support/kb", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Couldn't save.");
  return json;
}

function ArticleEditor({
  article,
  onSaved,
  onDeleted,
  onCancel,
}: {
  article: Partial<KbArticle>;
  onSaved: (a: KbArticle) => void;
  onDeleted?: () => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState({ ...EMPTY, ...article });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const { article: saved } = await post(draft);
      onSaved(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.panel}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <select className={styles.selectSmall} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
          {CATEGORIES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input
          className={styles.input}
          style={{ flex: 1, minWidth: 200 }}
          placeholder="Title (e.g. Finding your courses)"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
        <label className={styles.mutedText} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
          Active
        </label>
      </div>
      <textarea
        className={styles.input}
        rows={4}
        style={{ width: "100%", resize: "vertical" }}
        placeholder="What the bot should tell people — plain steps, exact menu names."
        value={draft.body}
        onChange={(e) => setDraft({ ...draft, body: e.target.value })}
      />
      {error && <p className={styles.errorText}>{error}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" className={styles.ctaSmall} disabled={busy} onClick={save}>
          Save
        </button>
        {onCancel && (
          <button type="button" className={styles.btnGhost} onClick={onCancel}>
            Cancel
          </button>
        )}
        {onDeleted && draft.id && (
          <button
            type="button"
            className={styles.dangerLink}
            disabled={busy}
            onClick={async () => {
              if (!confirm("Delete this article?")) return;
              await post({ op: "delete", id: draft.id });
              onDeleted();
            }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

export default function SupportKbClient({
  initialArticles,
  initialSettings,
}: {
  initialArticles: KbArticle[];
  initialSettings: SupportSettings;
}) {
  const [articles, setArticles] = useState(initialArticles);
  const [adding, setAdding] = useState(false);
  const [settings, setSettings] = useState(initialSettings);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  async function saveSettings() {
    setSettingsMsg(null);
    try {
      await post({
        op: "settings",
        office_hours: settings.officeHours,
        expected_wait_minutes: settings.expectedWaitMinutes,
        support_email: settings.supportEmail,
        timezone: settings.timezone,
      });
      setSettingsMsg("Saved.");
    } catch (e) {
      setSettingsMsg((e as Error).message);
    }
  }

  function setDay(day: string, idx: 0 | 1 | null, value?: string) {
    const hours = { ...settings.officeHours };
    if (idx === null) {
      if (hours[day]) delete hours[day];
      else hours[day] = ["09:00", "17:00"];
    } else if (hours[day]) {
      const next: [string, string] = [...hours[day]];
      next[idx] = value ?? next[idx];
      hours[day] = next;
    }
    setSettings({ ...settings, officeHours: hours });
  }

  return (
    <>
      <div className={styles.panel}>
        <h2 style={{ marginTop: 0 }}>Office hours</h2>
        <p className={styles.mutedText} style={{ fontSize: 13 }}>
          In these hours a handoff joins the live queue (Slack ping, student sees their place in line). Outside them, the
          chat is emailed to the inbox below instead.
        </p>
        {DAYS.map(([key, label]) => {
          const w = settings.officeHours[key];
          return (
            <div key={key} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <label style={{ width: 70, display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={!!w} onChange={() => setDay(key, null)} /> {label}
              </label>
              {w ? (
                <>
                  <input type="time" className={styles.inputSmall} value={w[0]} onChange={(e) => setDay(key, 0, e.target.value)} />
                  –
                  <input type="time" className={styles.inputSmall} value={w[1]} onChange={(e) => setDay(key, 1, e.target.value)} />
                </>
              ) : (
                <span className={styles.mutedText}>closed</span>
              )}
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
          <label className={styles.field}>
            Timezone
            <input className={styles.inputSmall} value={settings.timezone} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })} />
          </label>
          <label className={styles.field}>
            Typical wait (minutes) — shown as “Can&apos;t wait ~N min?”
            <input
              type="number"
              min={1}
              className={styles.inputSmall}
              value={settings.expectedWaitMinutes}
              onChange={(e) => setSettings({ ...settings, expectedWaitMinutes: Number(e.target.value) })}
            />
          </label>
          <label className={styles.field}>
            Inbox for emailed chats
            <input className={styles.inputSmall} value={settings.supportEmail} onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })} />
          </label>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
          <button type="button" className={styles.ctaSmall} onClick={saveSettings}>
            Save hours
          </button>
          {settingsMsg && <span className={styles.mutedText}>{settingsMsg}</span>}
        </div>
      </div>

      <div className={styles.pageHeadRow} style={{ marginTop: 24 }}>
        <h2 style={{ margin: 0 }}>Help articles ({articles.filter((a) => a.active).length} active)</h2>
        {!adding && (
          <button type="button" className={styles.ctaSmall} onClick={() => setAdding(true)}>
            Add article
          </button>
        )}
      </div>

      {adding && (
        <ArticleEditor
          article={{}}
          onCancel={() => setAdding(false)}
          onSaved={(a) => {
            setArticles((prev) => [...prev, a]);
            setAdding(false);
          }}
        />
      )}

      {CATEGORIES.map(([cat, label]) => {
        const list = articles.filter((a) => a.category === cat);
        if (list.length === 0) return null;
        return (
          <section key={cat} style={{ marginTop: 20 }}>
            <h3 className={styles.mutedText} style={{ textTransform: "uppercase", fontSize: 12, letterSpacing: 1 }}>
              {label}
            </h3>
            {list.map((a) => (
              <ArticleEditor
                key={a.id}
                article={a}
                onSaved={(saved) => setArticles((prev) => prev.map((x) => (x.id === saved.id ? saved : x)))}
                onDeleted={() => setArticles((prev) => prev.filter((x) => x.id !== a.id))}
              />
            ))}
          </section>
        );
      })}
    </>
  );
}
