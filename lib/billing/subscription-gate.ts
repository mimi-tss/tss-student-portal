import type { PaymentStatus, SubscriptionStatus } from "@/types/database";

// The one place that decides whether a student's subscription is in
// good enough standing to book a lesson — the "kill switch." Pure
// function so it's usable both from the booking route and anywhere else
// that needs the same check (a future self-service page, an admin
// override UI, etc.) without re-deriving the rule.
export function canBookLessons(student: {
  subscription_status: SubscriptionStatus;
  payment_status: PaymentStatus;
}): { allowed: boolean; reason?: string } {
  if (student.subscription_status === "paused") {
    return { allowed: false, reason: "Your subscription is currently paused." };
  }
  if (student.subscription_status === "cancelled") {
    return { allowed: false, reason: "Your subscription has been cancelled." };
  }
  if (student.payment_status === "dnc") {
    return { allowed: false, reason: "There's a payment issue on your account — please update your payment method to book." };
  }
  return { allowed: true };
}
