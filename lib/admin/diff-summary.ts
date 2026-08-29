const IGNORED_KEYS = new Set(["updated_at"]);

export interface FieldDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

// Turns audit_log's raw old_data/new_data jsonb into a readable
// field-level diff (e.g. tier: "suite" -> "pro") instead of two full
// JSON blobs — the trigger already strips no-op UPDATEs at the row
// level, this strips unchanged individual fields within a real change.
export function summarizeDiff(
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
): FieldDiff[] {
  const keys = new Set([...Object.keys(oldData ?? {}), ...Object.keys(newData ?? {})]);
  const diffs: FieldDiff[] = [];
  for (const key of keys) {
    if (IGNORED_KEYS.has(key)) continue;
    const oldValue = oldData?.[key];
    const newValue = newData?.[key];
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) diffs.push({ field: key, oldValue, newValue });
  }
  return diffs;
}
