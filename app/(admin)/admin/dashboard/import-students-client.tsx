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
  status: "created" | "updated" | "failed";
  error?: string;
}

const COLUMNS =
  "name,email,tier,session_duration_minutes,coach,day_of_week,start_time,frequency,ambassador,birth_date,billing_start_date,student_since,coach_since,phone,gender,address_street,address_city,address_state,address_zip,address_country,guardian_name,guardian_relationship,guardian_phone,guardian_email";

const TEMPLATE_CSV = `${COLUMNS}
Jane Example,jane@example.com,pro,30,celine@studio.test,tuesday,16:30,weekly,no,1998-04-02,2026-01-15,2024-09-01,2024-09-01,+1 555 010 1234,Female,123 Main St,Springfield,IL,62701,United States,,,,
`;

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "students-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

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
      if (body.results.some((r: RowResult) => r.status === "created" || r.status === "updated")) {
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
        Only name, email, and tier are required — everything else can be left blank.{" "}
        <code>coach</code> matches by email or exact name; <code>day_of_week</code> and{" "}
        <code>start_time</code> must be set together or both left blank.{" "}
        <code>coach_since</code> requires a coach to be set too. If a row&apos;s email already
        belongs to an existing student, that row backfills <code>phone</code>/<code>gender</code>/
        the <code>address_*</code>/<code>guardian_*</code> columns onto them instead of creating a
        new student — only fields currently blank get filled in, nothing already entered gets
        overwritten, and every other column on that row (tier, coach, schedule, etc.) is ignored.
      </p>
      <div>
        <button type="button" onClick={downloadTemplate} className={styles.linkBtnSmall}>
          Download CSV template
        </button>
      </div>

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
            {results.filter((r) => r.status === "created").length} created,{" "}
            {results.filter((r) => r.status === "updated").length} backfilled, of {results.length}{" "}
            rows.
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
                    <td>
                      {r.status === "created"
                        ? "Created"
                        : r.status === "updated"
                          ? "Backfilled"
                          : `Failed: ${r.error}`}
                    </td>
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
