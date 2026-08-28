// Minimal RFC-4180-ish CSV parser — no dependency needed for the one
// bulk-import use case (app/api/admin/bulk-import-students/route.ts).
// Handles quoted fields (so a student name like "Smith, Jr." doesn't split
// the row) and "" as an escaped quote inside a quoted field. Doesn't
// support embedded newlines inside a quoted field — not needed for this
// column schema (names/emails/times), and keeps this simple.
export function parseCsv(text: string): string[][] {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.length > 0);

  return lines.map((line) => {
    const fields: string[] = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (inQuotes) {
        if (char === '"') {
          if (line[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        fields.push(field);
        field = "";
      } else {
        field += char;
      }
    }

    fields.push(field);
    return fields.map((f) => f.trim());
  });
}

// Parses a CSV with a header row into an array of header-keyed row objects,
// matching headers case-insensitively.
export function parseCsvWithHeader(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.toLowerCase());

  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, i) => {
      obj[header] = row[i] ?? "";
    });
    return obj;
  });
}
