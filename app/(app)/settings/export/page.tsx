import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getServerT } from "@/lib/i18n/server";
import ExportShell from "@/components/export-shell";

export default async function ExportPage() {
  const { profile } = await requireSession();
  if (!profile?.household_id) redirect("/onboarding");

  // Capture a server-side timestamp so the default 30-day range is the
  // same in SSR and the first client render — same pattern as Reports.
  const nowISO = new Date().toISOString();

  await getServerT(); // ensures language is resolved through the cache
  return <ExportShell nowISO={nowISO} />;
}
