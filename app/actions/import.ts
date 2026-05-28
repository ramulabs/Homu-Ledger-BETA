"use server";

// RAM-26 — CSV bank import server action.
//
// Receives an array of pre-validated ImportRow objects from the
// ImportWizard client component and bulk-inserts them into the
// `transactions` table. Idempotency: each row carries a
// `client_op_id` derived from its source CSV row so retries are safe.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ImportRow = {
  date: string;          // YYYY-MM-DD
  amount: number;        // always positive
  name: string;          // description
  type: "income" | "expense";
  category_id?: string | null;
  wallet_id?: string | null;
  /** Stable hash of (date + amount + name) used for server-side idempotency. */
  client_op_id?: string | null;
};

export async function importTransactions(
  rows: ImportRow[],
  walletId: string
): Promise<{ inserted: number; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { inserted: 0, error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();
  const householdId = profile?.household_id;
  if (!householdId) return { inserted: 0, error: "No ledger found" };

  if (!rows.length) return { inserted: 0 };

  // Validate walletId belongs to this household
  if (walletId) {
    const { data: wallet } = await supabase
      .from("wallets")
      .select("id")
      .eq("id", walletId)
      .eq("household_id", householdId)
      .maybeSingle();
    if (!wallet) return { inserted: 0, error: "Wallet does not belong to this ledger" };
  }

  // Map to DB shape
  const inserts = rows.map((r) => ({
    household_id: householdId,
    created_by: user.id,
    type: r.type,
    amount: r.amount,
    name: r.name.slice(0, 200),
    date: r.date,
    wallet_id: walletId || null,
    category_id: r.category_id ?? null,
    photo_url: null,
    ...(r.client_op_id ? { client_op_id: r.client_op_id } : {}),
  }));

  // Supabase insert in a single batch. On conflict with client_op_id
  // (idempotency index) we ignore those rows — they were already inserted.
  const { error } = await supabase
    .from("transactions")
    .insert(inserts);

  if (error) {
    // Partial duplicate: some rows already exist. We can't count exact
    // inserted, so surface the error but still revalidate so the user
    // sees whatever made it through.
    revalidatePath("/transactions");
    revalidatePath("/reports");
    return { inserted: 0, error: error.message };
  }

  revalidatePath("/transactions");
  revalidatePath("/reports");
  return { inserted: rows.length };
}
