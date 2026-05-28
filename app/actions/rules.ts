"use server";

// RAM-28 — Categorization rules server actions.
//
// Shape mirrors app/actions/budgets.ts — plain-arg payloads, { error? }
// return shape, revalidatePath on write.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DbTransactionRule } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getHouseholdId(): Promise<{ household_id: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();

  if (!profile?.household_id) return { error: "No household" };
  return { household_id: profile.household_id };
}

// ---------------------------------------------------------------------------
// getRules — fetch all rules for the current household, ordered by order_idx
// ---------------------------------------------------------------------------

export async function getRules(): Promise<DbTransactionRule[]> {
  const res = await getHouseholdId();
  if ("error" in res) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transaction_rules")
    .select(
      "id, household_id, name, triggers, actions, order_idx, enabled, stop_processing, created_at"
    )
    .eq("household_id", res.household_id)
    .order("order_idx", { ascending: true });

  if (error || !data) return [];
  return data as DbTransactionRule[];
}

// ---------------------------------------------------------------------------
// saveRule — upsert (create when id is absent, update when present)
// ---------------------------------------------------------------------------

export async function saveRule(
  rule: Partial<DbTransactionRule>
): Promise<{ rule?: DbTransactionRule; error?: string }> {
  const res = await getHouseholdId();
  if ("error" in res) return { error: res.error };

  if (!rule.name?.trim()) return { error: "Rule name is required" };
  if (!Array.isArray(rule.triggers) || rule.triggers.length === 0)
    return { error: "At least one trigger is required" };
  if (!Array.isArray(rule.actions) || rule.actions.length === 0)
    return { error: "At least one action is required" };

  const supabase = await createClient();

  const payload = {
    household_id: res.household_id,
    name: rule.name.trim(),
    triggers: rule.triggers,
    actions: rule.actions,
    order_idx: rule.order_idx ?? 0,
    enabled: rule.enabled ?? true,
    stop_processing: rule.stop_processing ?? true,
  };

  let data: DbTransactionRule | null = null;

  if (rule.id) {
    // UPDATE — guard against cross-household writes via explicit eq
    const { data: updated, error } = await supabase
      .from("transaction_rules")
      .update(payload)
      .eq("id", rule.id)
      .eq("household_id", res.household_id)
      .select(
        "id, household_id, name, triggers, actions, order_idx, enabled, stop_processing, created_at"
      )
      .single();

    if (error || !updated) return { error: error?.message ?? "Failed to update rule" };
    data = updated as DbTransactionRule;
  } else {
    // INSERT
    const { data: inserted, error } = await supabase
      .from("transaction_rules")
      .insert(payload)
      .select(
        "id, household_id, name, triggers, actions, order_idx, enabled, stop_processing, created_at"
      )
      .single();

    if (error || !inserted) return { error: error?.message ?? "Failed to create rule" };
    data = inserted as DbTransactionRule;
  }

  revalidatePath("/settings/rules");
  return { rule: data };
}

// ---------------------------------------------------------------------------
// deleteRule
// ---------------------------------------------------------------------------

export async function deleteRule(id: string): Promise<{ error?: string }> {
  if (!id) return { error: "Rule id required" };

  const res = await getHouseholdId();
  if ("error" in res) return { error: res.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("transaction_rules")
    .delete()
    .eq("id", id)
    .eq("household_id", res.household_id);

  if (error) return { error: error.message };

  revalidatePath("/settings/rules");
  return {};
}

// ---------------------------------------------------------------------------
// reorderRules — bulk-update order_idx for each id in the supplied array
// ---------------------------------------------------------------------------

export async function reorderRules(ids: string[]): Promise<{ error?: string }> {
  if (!ids.length) return {};

  const res = await getHouseholdId();
  if ("error" in res) return { error: res.error };

  const supabase = await createClient();

  // Fire all updates in parallel — each is a targeted single-row patch.
  const updates = ids.map((id, idx) =>
    supabase
      .from("transaction_rules")
      .update({ order_idx: idx })
      .eq("id", id)
      .eq("household_id", res.household_id)
  );

  const results = await Promise.all(updates);
  const firstError = results.find((r) => r.error);
  if (firstError?.error) return { error: firstError.error.message };

  revalidatePath("/settings/rules");
  return {};
}
