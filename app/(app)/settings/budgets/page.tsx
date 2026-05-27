import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getBudgetsForLedger } from "@/app/actions/budgets";
import BudgetsShell from "@/components/budgets-shell";

export default async function BudgetsPage() {
  const { profile } = await requireSession();
  if (!profile?.household_id) redirect("/onboarding");

  // getBudgetsForLedger() does its OWN auth + household lookup. Re-using
  // it here keeps the wiring identical between the SSR first paint and
  // the post-save revalidatePath round-trip.
  const { budgets, expenseCategories, currency, error } = await getBudgetsForLedger();

  return (
    <BudgetsShell
      initialBudgets={budgets}
      expenseCategories={expenseCategories}
      currency={currency}
      iconStyle={profile.icon_style ?? "3d"}
      loadError={error ?? null}
    />
  );
}
