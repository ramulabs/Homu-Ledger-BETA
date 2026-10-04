"use server";

// Pending transactions (v1.48.0) — server actions for the accept sheet.
// Logic lives in lib/pending-server.ts; these resolve the session and use
// the service-role client, because accepting may target a ledger other than
// the current one (RLS on categories / wallets / transactions is scoped to
// the current ledger). Membership is checked explicitly in every function.

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getAdminClient } from "@/lib/supabase/admin";
import { acceptPending, findDuplicates, preparePending, type PrepareResult } from "@/lib/pending-server";

export type { PendingLedgerData, PrepareResult } from "@/lib/pending-server";

/**
 * Load everything the accept sheet needs. Without `householdId` it also
 * picks the ledger to pre-select; with it (the user switched ledger) it
 * reloads that ledger and re-runs the smart fill.
 */
export async function preparePendingAccept(input: {
  itemId: string;
  householdId?: string;
  description?: string;
  type?: "income" | "expense";
}): Promise<PrepareResult> {
  const { user } = await requireSession();
  return preparePending(getAdminClient(), user.id, input);
}

/** Transactions in the chosen ledger with the same amount within ±2 days. */
export async function findPendingDuplicates(input: { householdId: string; amount: string; date: string }) {
  const { user } = await requireSession();
  return findDuplicates(getAdminClient(), user.id, input);
}

/** Accept a pending item into the chosen ledger. */
export async function acceptPendingAction(input: {
  itemId: string;
  householdId: string;
  type: string;
  amount: string;
  name: string;
  categoryId: string | null;
  walletId: string | null;
  date: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await requireSession();
  const res = await acceptPending(getAdminClient(), user.id, input);
  if (res.ok) {
    revalidatePath("/transactions");
    revalidatePath("/reports");
  }
  return res;
}
