// Shown before a coach marks a lesson no-show — the first guard against a
// mis-click (the second is the email's 2-hour grace period,
// app/api/cron/session-reminders). Studio call 2026-09-28.
//
// The checkbox lets the coach skip the missed-lesson email, e.g. when the
// student already told them they couldn't make it — the coach then lets
// the studio know on Slack instead (studio call 2026-09-30).
//
// Resolves null if cancelled, else whether to send the email. A plain DOM
// dialog (not React) so every caller can just `await` it; the theme
// tokens live on each dashboard's .root class, not <body>, so colors are
// picked from <html data-theme> here.
export function confirmNoShow(studentName?: string | null): Promise<{ sendEmail: boolean } | null> {
  const who = studentName?.trim() || "this student";
  const light = document.documentElement.dataset.theme === "light";
  const c = light
    ? { surface: "#ffffff", text: "#201d2b", muted: "#6b6878", border: "#ddd9e8", accent: "#6d4fd1", accentText: "#ffffff" }
    : { surface: "#1a1a26", text: "#f4f0e6", muted: "#9997ab", border: "#2c2c3d", accent: "#a78bfa", accentText: "#241a3d" };

  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.style.cssText = `max-width:380px;width:calc(100% - 32px);padding:20px;border:1px solid ${c.border};border-radius:14px;background:${c.surface};color:${c.text};font:inherit;font-size:15px;line-height:1.45`;

    const title = document.createElement("p");
    title.style.cssText = "margin:0 0 8px;font-weight:700;font-size:16px";
    title.textContent = `Mark ${who} as a no-show?`;

    const label = document.createElement("label");
    label.style.cssText = "display:flex;gap:10px;align-items:flex-start;margin:14px 0 6px;cursor:pointer";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = true;
    box.style.cssText = `margin-top:3px;accent-color:${c.accent};width:16px;height:16px;flex:none`;
    const boxText = document.createElement("span");
    boxText.textContent = "Send the missed-lesson email (goes out in 2 hours unless you change the status back)";
    label.append(box, boxText);

    const hint = document.createElement("p");
    hint.style.cssText = `margin:0 0 16px 26px;color:${c.muted};font-size:13px`;
    hint.textContent = "Already heard from them? Untick this and let the studio know on Slack.";

    const row = document.createElement("div");
    row.style.cssText = "display:flex;justify-content:flex-end;gap:8px";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.style.cssText = `padding:8px 14px;border-radius:10px;border:1px solid ${c.border};background:transparent;color:${c.text};font:inherit;cursor:pointer`;
    const ok = document.createElement("button");
    ok.type = "button";
    ok.textContent = "Mark no-show";
    ok.style.cssText = `padding:8px 14px;border-radius:10px;border:none;background:${c.accent};color:${c.accentText};font:inherit;font-weight:700;cursor:pointer`;
    row.append(cancel, ok);

    dialog.append(title, label, hint, row);
    document.body.append(dialog);

    let result: { sendEmail: boolean } | null = null;
    cancel.onclick = () => dialog.close();
    ok.onclick = () => {
      result = { sendEmail: box.checked };
      dialog.close();
    };
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(result);
    });
    dialog.showModal();
    ok.focus();
  });
}
