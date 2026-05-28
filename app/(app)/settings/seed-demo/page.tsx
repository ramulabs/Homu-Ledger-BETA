import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import SeedDemoShell from "@/components/seed-demo-shell";

export default async function SeedDemoPage() {
  const { profile } = await requireSession();
  if (!profile?.is_developer) notFound();
  return <SeedDemoShell />;
}
