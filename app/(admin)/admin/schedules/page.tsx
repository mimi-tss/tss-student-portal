import { createClient } from "@/lib/supabase/server";
import SchedulesClient from "./schedules-client";

export default async function AdminSchedulesPage() {
  const supabase = await createClient();
  const { data: coaches } = await supabase.from("coaches").select("id, name").order("name");

  return (
    <main className="p-8">
      <h1 className="mb-4 text-xl font-semibold">Coach Schedules</h1>
      <SchedulesClient coaches={coaches ?? []} />
    </main>
  );
}
