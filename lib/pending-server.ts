// Server-side logic for Pending transactions (v1.48.0). Thin server actions
// in app/actions/pending.ts resolve the session and call these with the
// service-role client and the signed-in user's id. Every function checks
// household membership explicitly — RLS doesn't apply to the admin client.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { matchCategoryLocally } from "@/lib/categorize-local";
import { canonicalKey } from "@/lib/llm/normalize";
import { isClientOpDuplicate } from "@/lib/idempotency";
import { LIMITS, validateAmount, validateDate, validateName } from "@/lib/validation";
import { pendingMatchKey, type PendingParsed } from "@/lib/pending";
import type { DbCategory, DbWallet } from "@/lib/types";

export type Admin = SupabaseClient<Database>;
type TxType = "income" | "expense";

export type PendingLedgerData = {
  currency: string;
  categories: DbCategory[];
  wallets: DbWallet[];
  categoryId: string | null;
  categorySource: "agent" | "rule" | "cache" | "seed" | null;
  walletId: string | null;
};

export type PrepareResult =
  | {
      ok: true;
      householdId: string | null;
      /** Why this ledger was pre-selected (only on the first call). */
      source: "history" | "agent" | null;
      ledger: PendingLedgerData | null;
    }
  | { ok: false; error: string };

const GONE = "This pending transaction is no longer available.";

function parseAmount(raw: string): number {
  return parseFloat(raw.replace(/\./g, "").replace(",", ".")) || 0;
}

async function loadPendingItem(admin: Admin, userId: string, itemId: string) {
  const { data } = await admin
    .from("inbox_items")
    .select("id, parsed, status")
    .eq("id", itemId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || data.status !== "pending") return null;
  return { id: data.id, parsed: (data.parsed ?? {}) as PendingParsed };
}

async function isMember(admin: Admin, userId: string, householdId: string) {
  const { data } = await admin
    .from("household_members")
    .select("household_id")
    .eq("household_id", householdId)
    .eq("profile_id", userId)
    .maybeSingle();
  return !!data;
}

/**
 * Ledger pre-selection, in order:
 *   1. history — the user's two most recent accepts of a similar item went
 *      to the same ledger (so a change of habit is picked up quickly);
 *   2. the source's suggested ledger name, if the user is a member of it;
 *   3. nothing — the user must choose.
 */
async function suggestLedger(admin: Admin, userId: string, parsed: PendingParsed) {
  const { data: memberships } = await admin
    .from("household_members")
    .select("household_id")
    .eq("profile_id", userId);
  const memberIds = new Set((memberships ?? []).map((m) => m.household_id));

  const key = pendingMatchKey(parsed);
  if (key) {
    const { data: recent } = await admin
      .from("inbox_items")
      .select("accepted_household_id")
      .eq("user_id", userId)
      .eq("status", "accepted")
      .eq("match_key", key)
      .order("reviewed_at", { ascending: false })
      .limit(2);
    const [a, b] = recent ?? [];
    if (a?.accepted_household_id && a.accepted_household_id === b?.accepted_household_id && memberIds.has(a.accepted_household_id)) {
      return { householdId: a.accepted_household_id, source: "history" as const };
    }
  }

  const wanted = typeof parsed.ledger === "string" ? parsed.ledger.trim().toLowerCase() : "";
  if (wanted && memberIds.size > 0) {
    const { data: households } = await admin
      .from("households")
      .select("id, name")
      .in("id", [...memberIds]);
    const match = (households ?? []).find((h) => h.name.trim().toLowerCase() === wanted);
    if (match) return { householdId: match.id, source: "agent" as const };
  }

  return { householdId: null, source: null };
}

/** Categories, wallets and smart-filled category/wallet for one ledger. */
async function ledgerData(
  admin: Admin,
  householdId: string,
  description: string,
  type: TxType,
  parsed: PendingParsed
): Promise<PendingLedgerData> {
  const [{ data: household }, { data: cats }, { data: walletRows }] = await Promise.all([
    admin.from("households").select("currency").eq("id", householdId).maybeSingle(),
    admin.from("categories").select("id, name, symbol, color, type").eq("household_id", householdId).order("name"),
    admin
      .from("wallets")
      .select("id, name, symbol, color, initial_balance, is_default")
      .eq("household_id", householdId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true }),
  ]);
  const categories = (cats ?? []) as DbCategory[];
  const wallets: DbWallet[] = (walletRows ?? []).map((w) => ({ ...w, initial_balance: Number(w.initial_balance ?? 0) }));
  const ofType = categories.filter((c) => c.type === type);
  const lower = (s: unknown) => (typeof s === "string" ? s.trim().toLowerCase() : "");

  // Category: the source's suggestion if this ledger has it, else Homu's
  // keyword rules, else empty.
  let categoryId: string | null = null;
  let categorySource: PendingLedgerData["categorySource"] = null;
  const suggested = ofType.find((c) => c.name.toLowerCase() === lower(parsed.category));
  if (suggested) {
    categoryId = suggested.id;
    categorySource = "agent";
  } else if (description.trim()) {
    const match = await matchCategoryLocally(admin, householdId, description, type, ofType);
    if (match) {
      categoryId = match.categoryId;
      categorySource = match.source;
    }
  }

  // Wallet: the source's suggestion if this ledger has it, else the default.
  const wallet =
    wallets.find((w) => w.name.toLowerCase() === lower(parsed.wallet)) ??
    wallets.find((w) => w.is_default) ??
    wallets[0] ??
    null;

  return {
    currency: household?.currency ?? "IDR",
    categories,
    wallets,
    categoryId,
    categorySource,
    walletId: wallet?.id ?? null,
  };
}

/**
 * Load everything the accept sheet needs. Without `householdId` it also
 * picks the ledger to pre-select; with it (the user switched ledger) it
 * reloads that ledger's categories / wallets and re-runs the smart fill
 * against the description and type currently in the sheet.
 */
export async function preparePending(
  admin: Admin,
  userId: string,
  input: {
  itemId: string;
  householdId?: string;
  description?: string;
  type?: TxType;
}): Promise<PrepareResult> {
  const item = await loadPendingItem(admin, userId, input.itemId);
  if (!item) return { ok: false, error: GONE };

  let householdId = input.householdId ?? null;
  let source: "history" | "agent" | null = null;
  if (input.householdId === undefined) {
    const s = await suggestLedger(admin, userId, item.parsed);
    householdId = s.householdId;
    source = s.source;
  }
  if (!householdId) return { ok: true, householdId: null, source: null, ledger: null };
  if (!(await isMember(admin, userId, householdId))) {
    return { ok: false, error: "You're not a member of that ledger." };
  }

  const type: TxType = input.type ?? (item.parsed.type === "income" ? "income" : "expense");
  const description = input.description ?? item.parsed.name ?? "";
  const ledger = await ledgerData(admin, householdId, description, type, item.parsed);
  return { ok: true, householdId, source, ledger };
}

/** Transactions in the ledger with the same amount within ±2 days. */
export async function findDuplicates(
  admin: Admin,
  userId: string,
  input: {
  householdId: string;
  amount: string;
  date: string;
}): Promise<{ date: string; name: string; amount: number }[]> {
  const amount = parseAmount(input.amount);
  if (!amount || validateDate(input.date)) return [];
  if (!(await isMember(admin, userId, input.householdId))) return [];

  const day = new Date(`${input.date}T00:00:00Z`).getTime();
  const shift = (days: number) => new Date(day + days * 86_400_000).toISOString().slice(0, 10);
  const { data } = await admin
    .from("transactions")
    .select("date, name, amount")
    .eq("household_id", input.householdId)
    .eq("amount", amount)
    .is("transfer_pair_id", null)
    .gte("date", shift(-2))
    .lte("date", shift(2))
    .order("date", { ascending: false })
    .limit(3);
  return (data ?? []).map((r) => ({ date: r.date, name: r.name, amount: Number(r.amount) }));
}

/** Accept a pending item into the chosen ledger. */
export async function acceptPending(
  admin: Admin,
  userId: string,
  input: {
  itemId: string;
  householdId: string;
  type: string;
  amount: string;
  name: string;
  categoryId: string | null;
  walletId: string | null;
  date: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {

  const item = await loadPendingItem(admin, userId, input.itemId);
  if (!item) return { ok: false, error: GONE };
  if (!input.householdId) return { ok: false, error: "Choose a ledger first." };
  if (!(await isMember(admin, userId, input.householdId))) {
    return { ok: false, error: "You're not a member of that ledger." };
  }

  if (input.type !== "income" && input.type !== "expense") {
    return { ok: false, error: "Type must be income or expense." };
  }
  const type: TxType = input.type;
  const name = input.name.trim();
  const amount = parseAmount(input.amount);
  const err = validateName(name, LIMITS.TX_NAME, "Description") ?? validateAmount(amount) ?? validateDate(input.date);
  if (err) return { ok: false, error: err };

  if (input.categoryId) {
    const { data: cat } = await admin
      .from("categories")
      .select("type")
      .eq("id", input.categoryId)
      .eq("household_id", input.householdId)
      .maybeSingle();
    if (!cat || cat.type !== type) return { ok: false, error: "That category isn't in the chosen ledger." };
  }
  if (input.walletId) {
    const { data: wallet } = await admin
      .from("wallets")
      .select("id")
      .eq("id", input.walletId)
      .eq("household_id", input.householdId)
      .maybeSingle();
    if (!wallet) return { ok: false, error: "That wallet isn't in the chosen ledger." };
  }

  const note = typeof item.parsed.note === "string" && item.parsed.note.trim() ? item.parsed.note.trim().slice(0, 500) : null;

  // client_op_id = the pending item's id: a double-tapped Accept hits the
  // (household_id, client_op_id) unique index instead of logging twice.
  const { data: tx, error } = await admin
    .from("transactions")
    .insert({
      household_id: input.householdId,
      created_by: userId,
      type,
      amount,
      name,
      category_id: input.categoryId,
      wallet_id: input.walletId,
      date: input.date,
      note,
      client_op_id: item.id,
    })
    .select("id")
    .single();

  let transactionId = tx?.id ?? null;
  if (error) {
    if (!isClientOpDuplicate(error)) return { ok: false, error: error.message };
    const { data: existing } = await admin
      .from("transactions")
      .select("id")
      .eq("household_id", input.householdId)
      .eq("client_op_id", item.id)
      .maybeSingle();
    transactionId = existing?.id ?? null;
  }

  await admin
    .from("inbox_items")
    .update({
      status: "accepted",
      accepted_transaction_id: transactionId,
      accepted_household_id: input.householdId,
      match_key: pendingMatchKey(item.parsed),
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", item.id)
    .eq("user_id", userId)
    .eq("status", "pending");

  // Teach that ledger's category cache, like a normal save does.
  const key = canonicalKey(name);
  if (key && input.categoryId) {
    await admin
      .from("category_hints")
      .upsert(
        { household_id: input.householdId, keyword: key, category_id: input.categoryId, source: "user" },
        { onConflict: "household_id,keyword" }
      );
  }

  return { ok: true };
}
