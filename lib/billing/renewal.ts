import { currentBillingCycleRange } from "@/lib/scheduling/recurring";

// Plain-language renewal date (TSS_App_Spec_1.md section 4). Studio
// policy: a student can cancel any time before the billing cycle ends
// to avoid renewal — no separate cancel-by buffer date. The student's
// billing cycle already renews on their billing anniversary — reuses
// currentBillingCycleRange's cycle-end (lib/scheduling/recurring.ts,
// same anchor-day/short-month-clamping logic already relied on for
// session caps) rather than recomputing the anniversary math separately.
export function renewalInfo(billingAnniversaryDate: string | null | undefined, now: Date = new Date()) {
  const { end: renewalDate } = currentBillingCycleRange(billingAnniversaryDate, now);
  return { renewalDate };
}
