import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getRules } from "@/app/actions/rules";
import { createClient } from "@/lib/supabase/server";
import RulesShell from "@/components/rules-shell";
import type { DbCategory } from "@/lib/types";

export default async function RulesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { profile } = await requireSession();
  if (!profile?.household_id) redirect("/onboarding");

  // Resolve search params (Next.js 16 async searchParams)
  const sp = await searchParams;

  const [rules, supabase] = await Promise.all([getRules(), createClient()]);

  // Load all categories for this household — needed by the action picker
  // inside the rule sheet (category_id action field).
  const { data: categoriesRaw } = await supabase
    .from("categories")
    .select("id, name, symbol, color, type, is_default")
    .eq("household_id", profile.household_id)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  const categories = (categoriesRaw ?? []) as DbCategory[];

  // Prefill from query params — used by "Create rule from transaction" flow.
  const prefill =
    sp.prefill || sp.category_id
      ? {
          name: sp.prefill ?? "",
          category_id: sp.category_id ?? "",
        }
      : null;

  return (
    <RulesShell
      initialRules={rules}
      categories={categories}
      iconStyle={profile.icon_style ?? "3d"}
      prefill={prefill}
    />
  );
}
