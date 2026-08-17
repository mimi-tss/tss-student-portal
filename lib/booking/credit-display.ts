// Session credits are one internal table (makeup_credits) with several
// distinct sources, but students should only ever see the generic,
// friendly name — the type/reason breakdown is an admin/coach-only
// concept. See TSS_App_Spec_1.md section 5.

export function creditDisplayName(sessionDurationMinutes: number) {
  return `${sessionDurationMinutes}-min Vocal Session Credit`;
}

// Admin/coach-facing label for a credit's origin — never shown to students.
export function creditTypeLabel(type: string) {
  switch (type) {
    case "student-fault":
      return "makeup";
    case "studio-planned":
      return "studio-planned";
    case "studio-emergency":
      // The only path that creates this type today is admin's
      // "staff cancel" — revisit this label if a second source
      // (e.g. the spec'd same-day-coach-block flow) is ever built.
      return "staff cancel";
    case "purchased-addon":
      return "purchased add-on";
    default:
      return type;
  }
}
