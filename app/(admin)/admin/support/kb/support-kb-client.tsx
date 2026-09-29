"use client";

import { useRef, useState } from "react";
import type { SupportSettings } from "@/lib/support/settings";
import styles from "../../../admin.module.css";

export interface KbArticle {
  id: string;
  category: string;
  title: string;
  body: string;
  active: boolean;
  sort_order: number;
  slug: string;
  summary: string | null;
  is_public: boolean;
  helpful_yes: number;
  helpful_no: number;
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

const EMPTY: Omit<KbArticle, "id"> = {
  category: "portal",
  title: "",
  body: "",
  active: true,
  sort_order: 100,
  slug: "",
  summary: null,
  is_public: false,
  helpful_yes: 0,
  helpful_no: 0,
};

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
  const [open, setOpen] = useState(!article.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const { article: result } = await post(draft);
      setDraft(result);
      onSaved(result);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Screenshot -> help-images bucket -> Markdown image at the cursor.
  async function uploadImage(file: File) {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    const res = await fetch("/api/admin/support/kb/image", { method: "POST", body: form });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Upload failed.");
      return;
    }
    const el = bodyRef.current;
    const at = el?.selectionStart ?? draft.body.length;
    const snippet = `\n![Screenshot](${json.url})\n`;
    setDraft((d) => ({ ...d, body: d.body.slice(0, at) + snippet + d.body.slice(at) }));
  }

  if (!open) {
    return (
      <div className={styles.panel} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <strong>{draft.title}</strong>{" "}
          {draft.is_public ? <span className={styles.badge}>Public</span> : <span className={styles.badgeMuted}>Mel only</span>}{" "}
          {!draft.active && <span className={styles.badgeWarn}>Off</span>}
          <div className={styles.mutedText} style={{ fontSize: 13, marginTop: 4 }}>
            /help/a/{draft.slug}
            {(draft.helpful_yes > 0 || draft.helpful_no > 0) && (
              <>
                {" "}
                · 👍 {draft.helpful_yes} 👎 {draft.helpful_no}
              </>
            )}
          </div>
        </div>
        <a href={`/help/a/${draft.slug}`} target="_blank" rel="noopener noreferrer" className={styles.linkBtnSmall}>
          {draft.is_public ? "View" : "Preview"}
        </a>
        <button type="button" className={styles.btnGhost} onClick={() => setOpen(true)}>
          Edit
        </button>
      </div>
    );
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
          placeholder="Title (e.g. Rescheduling a lesson)"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </div>
      <input
        className={styles.input}
        style={{ width: "100%", marginBottom: 8 }}
        placeholder="One-line summary shown in lists and search (optional)"
        value={draft.summary ?? ""}
        onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
      />
      <textarea
        ref={bodyRef}
        className={styles.input}
        rows={12}
        style={{ width: "100%", resize: "vertical", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13 }}
        placeholder={"Plain steps with exact menu names. Formatting:\n## Heading\n1. Numbered step\n- Bullet\n**bold**\n[link text](https://...)"}
        value={draft.body}
        onChange={(e) => setDraft({ ...draft, body: e.target.value })}
      />
      <div className={styles.mutedText} style={{ fontSize: 12, marginTop: 4 }}>
        Formatting: <code>## Heading</code> · <code>1. Step</code> · <code>- bullet</code> · <code>**bold**</code> ·{" "}
        <code>[text](https://link)</code> · screenshots with the button below.
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
        <label className={styles.ctaSmall} style={{ cursor: "pointer" }}>
          Add screenshot
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadImage(f);
              e.target.value = "";
            }}
          />
        </label>
        <label className={styles.mutedText} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={draft.is_public} onChange={(e) => setDraft({ ...draft, is_public: e.target.checked })} />
          Show in public help center
        </label>
        <label className={styles.mutedText} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
          Active (Mel uses it)
        </label>
        <label className={styles.mutedText} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          Web address /help/a/
          <input
            className={styles.inputSmall}
            style={{ width: 200 }}
            placeholder="from title"
            value={draft.slug}
            onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
          />
        </label>
      </div>

      {error && <p className={styles.errorText}>{error}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className={styles.ctaSmall} disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save"}
        </button>
        {draft.id && (
          <a href={`/help/a/${draft.slug}`} target="_blank" rel="noopener noreferrer" className={styles.linkBtnSmall}>
            {draft.is_public ? "View page" : "Preview page"}
          </a>
        )}
        {draft.id && (
          <button type="button" className={styles.btnGhost} onClick={() => setOpen(false)}>
            Done
          </button>
        )}
        {onCancel && (
          <button type="button" className={styles.btnGhost} onClick={onCancel}>
            Cancel
          </button>
        )}
        {saved && <span className={styles.successText}>Saved.</span>}
        {onDeleted && draft.id && (
          <button
            type="button"
            className={styles.dangerLink}
            style={{ marginLeft: "auto" }}
            disabled={busy}
            onClick={async () => {
              if (!confirm("Delete this article? Mel and the help center will stop using it.")) return;
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
