import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SubscriptionClient from "./subscription-client";
import InvoicesClient from "./invoices-client";
import AccountDetailsClient from "./account-details-client";
import styles from "../billing.module.css";

// Only page under /billing that requires a session — the pricing page
// and checkout flow stay reachable logged out. Session here comes from
// this site's own login (/billing/login), not the main app's.
//
// Deliberately doesn't read status/amount/etc. from our local `students`
// mirror here — that only ever tracked tier/subscription_status/
// payment_status (never amount/card/next-charge), and for a not-yet-
// linked legacy Opus customer it could be stale or simply never set.
// SubscriptionClient fetches live from Stripe (and performs the lazy
// link-on-first-view) instead — see app/api/billing/subscription/route.ts.
export default async function BillingAccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/billing/login");

  const { data: student } = await supabase
    .from("students")
    .select(
      "id, name, email, phone, birth_date, gender, address_street, address_city, address_state, address_zip, address_country, guardian_name, guardian_relationship, guardian_phone, guardian_email, notify_reminders_email, notify_reminders_sms, notify_bookings_email, notify_bookings_sms, notify_credits_email, notify_credits_sms, notify_messages_email, notify_recordings_email, notify_digest_email",
    )
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!student) redirect("/billing/login?error=student_not_found");

  return (
    <div className={styles.wrap}>
      <div id="account" />
      <AccountDetailsClient
        initial={{
          name: student.name,
          email: student.email,
          phone: student.phone,
          birthDate: student.birth_date,
          gender: student.gender,
          addressStreet: student.address_street,
          addressCity: student.address_city,
          addressState: student.address_state,
          addressZip: student.address_zip,
          addressCountry: student.address_country,
          guardianName: student.guardian_name,
          guardianRelationship: student.guardian_relationship,
          guardianPhone: student.guardian_phone,
          guardianEmail: student.guardian_email,
        }}
        notificationPrefs={{
          notify_reminders_email: student.notify_reminders_email,
          notify_reminders_sms: student.notify_reminders_sms,
          notify_bookings_email: student.notify_bookings_email,
          notify_bookings_sms: student.notify_bookings_sms,
          notify_credits_email: student.notify_credits_email,
          notify_credits_sms: student.notify_credits_sms,
          notify_messages_email: student.notify_messages_email,
          notify_recordings_email: student.notify_recordings_email,
          notify_digest_email: student.notify_digest_email,
        }}
      />
      <h1 id="billing" className={styles.title} style={{ textAlign: "left" }}>
        Your plan
      </h1>
      <SubscriptionClient />
      <InvoicesClient />
    </div>
  );
}
