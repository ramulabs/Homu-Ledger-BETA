"use server";

// RAM-5 — Budgets server actions.
//
// Shape mirrors app/actions/categories.ts (string-id + FormData /
// plain-arg payloads, { error?, ... } return shape) so the calling sheet
// can wire up exactly like the existing edit-category sheet.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { BudgetWithProgress, DbBudget, DbCategory } from "@/lib/types";

/**
 * Upsert the monthly cap for ONE category. The unique (household_id,
 * category_id) index turns this into an upsert via PostgREST's
 * `onConflict` mode. If a row already exists we replace amount + currency
 * (and bump updated_at via the 0028 trigger); otherwise we insert.
 *
 * Returns the saved row so the client can update its local state without
 * a refetch.
 */
export async function setBudget(input: {
  category_id: string;
  amount: number;
}): Promise<{ budget?: DbBudget; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();

  if (!profile?.household_id) return { error: "No household" };

  if (!input.category_id) return { error: "Category required" };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { error: "Enter a positive amount" };
  }

  // Pull the household's currency so the row records what currency this
  // cap was set in. We don't trust a client-supplied currency here.
  const { data: household, error: hhErr } = await supabase
    .from("households")
    .select("currency")
    .eq("id", profile.household_id)
    .single();
  if (hhErr || !household) return { error: hhErr?.message ?? "Household lookup failed" };

  // Defensive: budgets are expense-only by product decision. Block income
  // categories at the action layer — there's no DB constraint because the
  // table doesn't reference category type and we don't want a migration
  // dependency between categories and budgets.
  const { data: cat, error: catErr } = await supabase
    .from("categories")
    .select("id, type, household_id")
    .eq("id", input.category_id)
    .single();
  if (catErr || !cat) return { error: catErr?.message ?? "Category not found" };
  if (cat.household_id !== profile.household_id) return { error: "Category not in this ledger" };
  if (cat.type === "income") return { error: "Budgets are for expense categories only." };

  const { data, error } = await supabase
    .from("budgets")
    .upsert(
      {
        household_id: profile.household_id,
        category_id: input.category_id,
        amount: input.amount,
        currency: household.currency ?? "IDR",
        created_by: user.id,
      },
      { onConflict: "household_id,category_id" }
    )
    .select("id, category_id, amount, currency, created_by, created_at, updated_at")
    .single();

  if (error || !data) return { error: error?.message ?? "Failed to save budget" };

  revalidatePath("/settings/budgets");
  revalidatePath("/transactions");
  revalidatePath("/reports");

  return { budget: { ...data, amount: Number(data.amount) } as DbBudget };
}

/**
 * Remove a category's cap. Pass `category_id` not the row id so the call
 * site doesn't have to remember which one it is (the row is unique per
 * category in a household anyway).
 */
export async function removeBudget(category_id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();

  if (!profile?.household_id) return { error: "No household" };
  if (!category_id) return { error: "Category required" };

  const { error } = await supabase
    .from("budgets")
    .delete()
    .eq("household_id", profile.household_id)
    .eq("category_id", category_id);

  if (error) return { error: error.message };

  revalidatePath("/settings/budgets");
  revalidatePath("/transactions");
  revalidatePath("/reports");
  return {};
}

/**
 * Read all budgets for the caller's active household, joined with the
 * category metadata and with this-month's spent total filled in via the
 * 0034 RPC. One round-trip (RPC) + one SELECT — the page that calls this
 * can render the whole list without extra fetches.
 */
export async function getBudgetsForLedger(): Promise<{
  budgets: BudgetWithProgress[];
  expenseCategories: DbCategory[];
  currency: string;
  error?: string;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { budgets: [], expenseCategories: [], currency: "IDR", error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();

  if (!profile?.household_id) {
    return { budgets: [], expenseCategories: [], currency: "IDR", error: "No household" };
  }

  // Run the three queries in parallel — they're independent.
  const [budgetsRes, categoriesRes, spentRes, householdRes] = await Promise.all([
    supabase
      .from("budgets")
      .select("id, category_id, amount, currency, created_by, created_at, updated_at")
      .eq("household_id", profile.household_id),
    supabase
      .from("categories")
      .select("id, name, symbol, color, type, is_default")
      .eq("household_id", profile.household_id)
      .eq("type", "expense")
      .order("is_default", { ascending: false })
      .order("name", { ascending: true }),
    supabase.rpc("get_budget_spent_this_month"),
    supabase
      .from("households")
      .select("currency")
      .eq("id", profile.household_id)
      .single(),
  ]);

  if (budgetsRes.error)    return { budgets: [], expenseCategories: [], currency: "IDR", error: budgetsRes.error.message };
  if (categoriesRes.error) return { budgets: [], expenseCategories: [], currency: "IDR", error: categoriesRes.error.message };
  if (spentRes.error)      return { budgets: [], expenseCategories: [], currency: "IDR", error: spentRes.error.message };

  const spentByCategory = new Map<string, number>();
  for (const row of spentRes.data ?? []) {
    spentByCategory.set(row.category_id, Number(row.spent ?? 0));
  }

  const categories = (categoriesRes.data ?? []) as DbCategory[];
  const categoriesById = new Map<string, DbCategory>(categories.map((c) => [c.id, c]));

  const budgets: BudgetWithProgress[] = (budgetsRes.data ?? [])
    .map((b) => {
      const category = categoriesById.get(b.category_id);
      if (!category) return null; // budget orphaned (income category, etc.)
      const amount = Number(b.amount ?? 0);
      const spent = spentByCategory.get(b.category_id) ?? 0;
      const ratio = amount > 0 ? Math.max(spent / amount, 0) : 0;
      const state: BudgetWithProgress["state"] =
        ratio >= 1 ? "over" : ratio >= 0.8 ? "warning" : "neutral";
      return {
        budget: { ...b, amount } as DbBudget,
        category,
        spent,
        ratio,
        state,
      };
    })
    .filter((x): x is BudgetWithProgress => x !== null)
    .sort((a, b) => b.ratio - a.ratio);

  return {
    budgets,
    expenseCategories: categories,
    currency: householdRes.data?.currency ?? "IDR",
  };
}
