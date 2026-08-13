import { NextRequest, NextResponse } from "next/server";
import { listKajabiSubscriptions } from "@/lib/kajabi/client";
import { createAdminClient } from "@/lib/supabase/admin";

// Polling fallback for subscription cancellations and payment failures —
// Kajabi has no webhook for either (see app/api/webhooks/kajabi/route.ts
// for what real events exist). Scheduled every 5 minutes via Vercel Cron
// (vercel.json); tighten or loosen that interval if 5 minutes is too slow
// or too chatty against Kajabi's API rate limits.
//
// TODO: listKajabiSubscriptions()'s response shape and the status/contact
// field names read below are placeholders — confirm against Kajabi's
// OpenAPI spec once credentials exist.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: subscriptions } = await listKajabiSubscriptions();

  let updated = 0;

  for (const sub of subscriptions ?? []) {
    const kajabiContactId = sub.contact_id;
    const status = sub.status as string; // e.g. "active" | "cancelled" | "past_due"

    if (status === "cancelled") {
      const { data } = await admin
        .from("students")
        .update({ subscription_status: "cancelled" })
        .eq("kajabi_customer_id", kajabiContactId)
        .neq("subscription_status", "cancelled")
        .select("id");
      updated += data?.length ?? 0;
    }

    if (status === "past_due") {
      const { data } = await admin
        .from("students")
        .update({ payment_status: "dnc" })
        .eq("kajabi_customer_id", kajabiContactId)
        .neq("payment_status", "dnc")
        .select("id");
      updated += data?.length ?? 0;
      // TODO: post to Slack + block upcoming sessions in the coach
      // schedule view, per TSS_App_Spec_1.md section 3 (DNC automation).
    }
  }

  return NextResponse.json({ checked: subscriptions?.length ?? 0, updated });
}
