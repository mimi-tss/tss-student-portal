// Placeholder hand-written types matching supabase/migrations/0001_init.sql.
// Once the Supabase project exists, generate the real types instead:
//   npx supabase gen types typescript --project-id <id> > types/database.ts

export type Tier = "lite" | "suite" | "pro" | "elite";
export type SubscriptionStatus = "active" | "paused" | "cancelled";
export type PaymentStatus = "ok" | "dnc";
export type SessionStatus =
  | "scheduled"
  | "attended"
  | "no-show"
  | "late-forfeit"
  | "cancelled-with-notice"
  | "cancelled-no-notice";
export type MakeupCreditType = "student-fault" | "studio-planned" | "studio-emergency";
export type Role = "student" | "coach" | "admin";

export interface Student {
  id: string;
  name: string;
  email: string;
  assigned_coach_id: string | null;
  tier: Tier;
  subscription_status: SubscriptionStatus;
  payment_status: PaymentStatus;
}

export interface Coach {
  id: string;
  name: string;
  email: string;
  hourly_rate: number;
}

export interface Session {
  id: string;
  student_id: string;
  actual_coach_id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: SessionStatus;
  is_makeup: boolean;
}
