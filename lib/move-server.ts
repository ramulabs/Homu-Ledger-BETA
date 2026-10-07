// Server-side logic for moving a transaction to another ledger (v1.48.3).
// Thin server actions in app/actions/transactions.ts resolve the session and
// call these with the service-role client and the signed-in user's id.
// Membership of BOTH ledgers is checked explicitly — RLS doesn't apply to the
// admin client, and the user's own RLS only sees their current ledger.
//
// Wallets and categories belong to one ledger, so a moved transaction needs
// the target ledger's equivalents. prepareMove() suggests them (same name →
// default wallet / Homu's keyword rules); the user can change both before the
// move_transaction RPC (migration 0036) applies them.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { matchCategoryLocally } from "@/lib/categorize-local";
import type { DbCategory, DbWallet } from "@/lib/types";

type Admin = SupabaseClient<Database>;

const PHOTO_BUCKET = "transaction-photos";
const PUBLIC_PHOTO_PREFIX = "/storage/v1/object/public/transaction-photos/";

export type MoveTarget = {
  householdId: string;
  /** Every wallet in the target ledger, default first. */
  wallets: DbWallet[];
  /** The target ledger's categories of the transaction's type. */
  categories: DbCategory[];
  walletId: string | null;
  /** How walletId was chosen: same name as the current wallet, or the
   *  target's default because no wallet there has that name. */
  walletMatch: "same-name" | "default" | null;
  /** Name of the transaction's current wallet (for the "no X there" hint). */
  sourceWalletName: string | null;
  categoryId: string | null;
  categoryMatch: "same-name" | "rule" | "cache" | "seed" | null;
};

export type PrepareMoveResult = { ok: true; target: MoveTarget } | { ok: false; error: string };

const lower = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

async function isMember(admin: Admin, userId: string, householdId: string) {
  const { data } = await admin
    .from("household_members")
    .select("household_id")
    .eq("household_id", householdId)
    .eq("profile_id", userId)
    .maybeSingle();
  return !!data;
}

/** Target ledger's wallets / categories + the suggested mapping. */
export async function prepareMove(
  admin: Admin,
  userId: string,
  input: { transactionId: string; targetHouseholdId: string }
): Promise<PrepareMoveResult> {
  const { data: tx } = await admin
    .from("transactions")
    .select("id, household_id, type, name, transfer_pair_id, wallets(name), categories(name)")
    .eq("id", input.transactionId)
    .maybeSingle();
  if (!tx) return { ok: false, error: "Transaction not found." };
  if (tx.transfer_pair_id) return { ok: false, error: "Transfers can't be moved to another ledger." };
  if (tx.household_id === input.targetHouseholdId) return { ok: false, error: "This transaction is already in that ledger." };

  const [inSource, inTarget] = await Promise.all([
    isMember(admin, userId, tx.household_id),
    isMember(admin, userId, input.targetHouseholdId),
  ]);
  if (!inSource || !inTarget) return { ok: false, error: "You're not a member of that ledger." };

  const type = tx.type === "income" ? "income" : "expense";
  const [{ data: walletRows }, { data: categoryRows }] = await Promise.all([
    admin
      .from("wallets")
      .select("id, name, symbol, color, initial_balance, is_default")
      .eq("household_id", input.targetHouseholdId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true }),
    admin
      .from("categories")
      .select("id, name, symbol, color, type")
      .eq("household_id", input.targetHouseholdId)
      .eq("type", type)
      .order("created_at", { ascending: true }),
  ]);
  const wallets: DbWallet[] = (walletRows ?? []).map((w) => ({ ...w, initial_balance: Number(w.initial_balance ?? 0) }));
  const categories = (categoryRows ?? []) as DbCategory[];

  // PostgREST returns a to-one embed as an object (or an array on older
  // typings) — normalise both.
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] ?? null : v);
  const sourceWalletName = one(tx.wallets as { name: string } | { name: string }[] | null)?.name ?? null;
  const sourceCategoryName = one(tx.categories as { name: string } | { name: string }[] | null)?.name ?? null;

  // Wallet: same name, else the target's default. A transaction that had no
  // wallet still gets the default suggested — the user can see and change it.
  const sameWallet = sourceWalletName ? wallets.find((w) => lower(w.name) === lower(sourceWalletName)) : undefined;
  const fallbackWallet = wallets.find((w) => w.is_default) ?? wallets[0] ?? null;
  const wallet = sameWallet ?? fallbackWallet;

  // Category: same name and type, else Homu's keyword rules on the
  // description against the target ledger, else uncategorised.
  let categoryId: string | null = null;
  let categoryMatch: MoveTarget["categoryMatch"] = null;
  const sameCategory = sourceCategoryName ? categories.find((c) => lower(c.name) === lower(sourceCategoryName)) : undefined;
  if (sameCategory) {
    categoryId = sameCategory.id;
    categoryMatch = "same-name";
  } else if (tx.name.trim()) {
    const match = await matchCategoryLocally(admin, input.targetHouseholdId, tx.name, type, categories);
    if (match) {
      categoryId = match.categoryId;
      categoryMatch = match.source;
    }
  }

  return {
    ok: true,
    target: {
      householdId: input.targetHouseholdId,
      wallets,
      categories,
      walletId: wallet?.id ?? null,
      walletMatch: sameWallet ? "same-name" : wallet ? "default" : null,
      sourceWalletName,
      categoryId,
      categoryMatch,
    },
  };
}

/**
 * Photos live under `<householdId>/…` and storage RLS only lets members of
 * that ledger read them, so a moved transaction's photo is relocated to the
 * target ledger's folder. Copy → repoint → delete: a failure at any step
 * leaves the transaction pointing at a photo that still exists. Best-effort —
 * the move itself has already succeeded.
 */
export async function relocateMovedPhoto(admin: Admin, transactionId: string, targetHouseholdId: string) {
  const { data: tx } = await admin
    .from("transactions")
    .select("photo_url, household_id")
    .eq("id", transactionId)
    .maybeSingle();
  if (!tx?.photo_url || tx.household_id !== targetHouseholdId) return;

  const idx = tx.photo_url.indexOf(PUBLIC_PHOTO_PREFIX);
  const from = idx === -1 ? tx.photo_url : decodeURIComponent(tx.photo_url.slice(idx + PUBLIC_PHOTO_PREFIX.length));
  const [folder, ...rest] = from.split("/");
  if (!folder || rest.length === 0 || folder === targetHouseholdId) return;
  const to = `${targetHouseholdId}/${rest.join("/")}`;

  const storage = admin.storage.from(PHOTO_BUCKET);
  const { error: copyError } = await storage.copy(from, to);
  if (copyError) {
    console.warn("[move] photo copy failed:", copyError.message);
    return;
  }
  const { error: updateError } = await admin
    .from("transactions")
    .update({ photo_url: to })
    .eq("id", transactionId)
    .eq("household_id", targetHouseholdId);
  if (updateError) {
    console.warn("[move] photo repoint failed:", updateError.message);
    await storage.remove([to]);
    return;
  }
  await storage.remove([from]);
}
