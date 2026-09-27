"use client";

// "Notify student" option on every admin book/cancel action (default on).
// Untick it when fixing a mistake so the student doesn't get a string of
// confirmation/cancellation emails — lib/notifications/booking-events.ts.
export default function NotifyStudentCheckbox({
  checked,
  onChange,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}) {
  return (
    <label className={className} style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 8px" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      Notify student (email, plus text if they turned texts on)
    </label>
  );
}
