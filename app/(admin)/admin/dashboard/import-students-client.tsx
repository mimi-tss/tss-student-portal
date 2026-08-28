"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../admin.module.css";

interface ValidationError {
  row: number;
  error: string;
}

interface RowResult {
  row: number;
  email: string;
  status: "created" | "failed";
  error?: string;
}

const COLUMNS =
  "name,email,tier,session_duration_minutes,coach,day_of_week,start_time,frequency,ambassador,birth_date,billing_start_date,student_since";

// Bulk counterpart to the "Add ambassador / manual student" form above —
// for onboarding many real students at once instead of one at a time.
// See app/api/admin/bulk-import-students/route.ts for the full column
// schema, coach-lookup rules, and validate-everything-first behavior.
export default function ImportStudentsClient() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[] | null>(null);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleFile(file: File) {
    setFileName(file.name);
    setUploading(true);
    setValidationErrors(null);
    setResults(null);
    setErrorMsg(null);

    const csv = await file.text();
    const res = await fetch("/api/admin/bulk-import-students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    });

    const body = await res.json().catch(() => ({}));
    setUploading(false);

    if (res.status === 400 && body.validationErrors) {
      setValidationErrors(body.validationErrors);
    } else if (res.ok && body.results) {
      setResults(body.results);
      if (body.results.some((r: RowResult) => r.status === "created")) {
        router.refresh();
      }
    } else {
      setErrorMsg(body.error ?? "Import failed.");
    }
  }

  if (!open) {
    return (
      <div className={styles.panel}>
        <button onClick={() => setOpen(true)} className={styles.linkBtn}>
          Import students from CSV
        </button>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <h2>Import students from CSV</h2>
      <p className={styles.mutedText}>
        Header row required, columns: <code>{COLUMNS}</code>. Only name, email, and tier are
        required — the rest can be left blank. <code>coach</code> matches by email (unambiguous)
        or exact name (must be an active coach). <code>day_of_week</code> and{" "}
        <code>start_time</code> must both be set together to create a recurring schedule.{" "}
        <code>birth_date</code>, <code>billing_start_date</code>, and <code>student_since</code>{" "}
        are all <code>YYYY-MM-DD</code> — leave any blank to use the default (no birthday on
        file, today as the billing anchor, or account-creation date for "with us").
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        disabled={uploading}
      />
      {fileName && <p className={styles.mutedText}>{fileName}</p>}
      {uploading && <p className={styles.mutedText}>Importing…</p>}
      {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}

      {validationErrors && validationErrors.length > 0 && (
        <div>
          <p className={styles.errorText}>
            Nothing was created — fix these rows and re-upload:
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Row</th>
                <th>Problem</th>
              </tr>
            </thead>
            <tbody>
              {validationErrors.map((e, i) => (
                <tr key={i}>
                  <td>{e.row}</td>
                  <td>{e.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {results && (
        <div>
          <p className={styles.successText}>
            {results.filter((r) => r.status === "created").length} of {results.length} students
            created.
          </p>
          {results.some((r) => r.status === "failed") && (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Email</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i}>
                    <td>{r.row}</td>
                    <td>{r.email}</td>
                    <td>{r.status === "created" ? "Created" : `Failed: ${r.error}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <button onClick={() => setOpen(false)} className={styles.linkBtnSmall}>
        Close
      </button>
    </div>
  );
}
