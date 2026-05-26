"use server";

// Inbox / Integrations server actions — RAM-25 Phase 1.
//
// Backs the Settings → Integrations page. Generates API keys (Bearer
// tokens for the n8n / power-user path), revokes them, and provisions
// the user's <local>@inbox.homu.app forwarding address.

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getAdminClient } from "@/lib/supabase/admin";
import { generateApiKey } from "@/lib/inbox/keys";
import { ensureInboxAddress } from "@/lib/inbox/addresses";

export async function generateApiKeyAction(
  formData: FormData
): Promise<
  | { ok: true; key: string; prefix: string; id: string }
  | { ok: false; error: string }
> {
  const { user, profile } = await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Name is required." };
  if (name.length > 80) return { ok: false, error: "Name must be 80 characters or fewer." };

  const admin = getAdminClient();
  const { key, prefix, hash } = generateApiKey();

  const { data, error } = await admin
    .from("user_api_keys")
    .insert({
      user_id: user.id,
      key_prefix: prefix,
      key_hash: hash,
      name,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  // Provision the user's inbox address at the same time — power users
  // generally end up needing both, and ensureInboxAddress is idempotent.
  await ensureInboxAddress(admin, user.id, profile?.username ?? null);

  revalidatePath("/settings/integrations");
  return { ok: true, key, prefix, id: data.id };
}

export async function revokeApiKeyAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await requireSession();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Missing key id." };

  const admin = getAdminClient();
  const { error } = await admin
    .from("user_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/integrations");
  return { ok: true };
}

export async function ensureInboxAddressAction(): Promise<
  { ok: true; address: string; local_part: string } | { ok: false; error: string }
> {
  const { user, profile } = await requireSession();
  const admin = getAdminClient();
  try {
    const result = await ensureInboxAddress(admin, user.id, profile?.username ?? null);
    revalidatePath("/settings/integrations");
    return { ok: true, address: result.address, local_part: result.local_part };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to generate inbox address.",
    };
  }
}

// ── Accept / reject ───────────────────────────────────────────────────
//
// One-tap accept turns a pending inbox row into a real transaction using
// the user's current household + default wallet. Available only when the
// row has a `parsed` payload (`parse_method` is set) — raw-only rows
// will need the Add Transaction edit flow (sub-PR 5). Transfer-type
// parses also bounce out to the edit flow since they need both a source
// and a destination wallet.

type AcceptResult =
  | { ok: true; transaction_id: string }
  | { ok: false; error: string; needs_edit?: boolean };

export async function acceptInboxItemAction(
  formData: FormData
): Promise<AcceptResult> {
  const { user, profile } = await requireSession();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Missing inbox item id." };

  const admin = getAdminClient();
  const { data: item } = await admin
    .from("inbox_items")
    .select("id, user_id, parsed, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!item) return { ok: false, error: "Item not found." };
  if (item.status !== "pending") {
    return { ok: false, error: `Item is already ${item.status}.` };
  }

  const parsed = item.parsed as
    | { amount?: number; type?: string; name?: string; date?: string }
    | null;
  if (!parsed) {
    return { ok: false, error: "Item has no parsed data yet.", needs_edit: true };
  }
  const { amount, type, name, date } = parsed;
  if (
    typeof amount !== "number" ||
    !amount ||
    typeof name !== "string" ||
    !name ||
    typeof date !== "string" ||
    !date
  ) {
    return { ok: false, error: "Parsed data is incomplete.", needs_edit: true };
  }
  if (type !== "expense" && type !== "income") {
    // Transfers need both source + destination wallets — defer to the
    // full Add Transaction flow.
    return { ok: false, error: "Transfers can't be one-tap accepted.", needs_edit: true };
  }

  const householdId = profile?.household_id;
  if (!householdId) return { ok: false, error: "No active household." };

  // Pick the user's default wallet for this household. Fall back to the
  // first wallet if none is flagged default.
  const { data: defaultWallet } = await admin
    .from("wallets")
    .select("id")
    .eq("household_id", householdId)
    .eq("is_default", true)
    .maybeSingle();
  let walletId = defaultWallet?.id ?? null;
  if (!walletId) {
    const { data: anyWallet } = await admin
      .from("wallets")
      .select("id")
      .eq("household_id", householdId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    walletId = anyWallet?.id ?? null;
  }

  const { data: tx, error: txError } = await admin
    .from("transactions")
    .insert({
      household_id: householdId,
      created_by: user.id,
      type,
      amount,
      name,
      date,
      wallet_id: walletId,
    })
    .select("id")
    .single();
  if (txError) return { ok: false, error: txError.message };

  await admin
    .from("inbox_items")
    .update({
      status: "accepted",
      accepted_transaction_id: tx.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/transactions");
  return { ok: true, transaction_id: tx.id };
}

export async function rejectInboxItemAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await requireSession();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Missing inbox item id." };

  const admin = getAdminClient();
  const { error } = await admin
    .from("inbox_items")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/transactions");
  return { ok: true };
}

/**
 * Flip a pending inbox item to `accepted` without going through the
 * one-tap path. Used by the Edit flow: the user opens the row in
 * AddTransactionSheet, edits + saves a real transaction via the
 * existing queued path, and then we mark the inbox row done.
 *
 * `accepted_transaction_id` is optional — the offline queue doesn't
 * synchronously hand back a tx id, and the link is for traceability
 * only.
 */
export async function markInboxAcceptedAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await requireSession();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Missing inbox item id." };

  const txRaw = String(formData.get("transaction_id") ?? "").trim();
  const transactionId = txRaw.length > 0 ? txRaw : null;

  const admin = getAdminClient();
  const { error } = await admin
    .from("inbox_items")
    .update({
      status: "accepted",
      accepted_transaction_id: transactionId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/transactions");
  return { ok: true };
}
