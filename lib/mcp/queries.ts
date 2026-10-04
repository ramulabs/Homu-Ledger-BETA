// Data access for the Homu MCP tools. Every function takes a Supabase client
// scoped to the signed-in user (lib/mcp/auth.ts), so Row Level Security
// limits all reads and writes to that user's household. Kept free of
// Next.js / MCP imports so it can be exercised directly in tests.

import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { LIMITS, validateAmount, validateDate, validateName } from "@/lib/validation";

type Client = SupabaseClient<Database>;
type TxType = "income" | "expense";

export type HomuContext = {
  userId: string;
  householdId: string;
  ledgerName: string;
  currency: string;
};

export class HomuToolError extends Error {}

const PAGE = 1000;

const round2 = (n: number) => Math.round(n * 100) / 100;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthUtc(): string {
  return `${todayUtc().slice(0, 7)}-01`;
}

/** Resolve the user's current ledger — the same one the app shows. */
export async function loadContext(supabase: Client, userId: string): Promise<HomuContext> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.household_id) {
    throw new HomuToolError("This Homu account has no ledger yet. Finish setting up in the Homu app first.");
  }
  const { data: household } = await supabase
    .from("households")
    .select("name, currency")
    .eq("id", profile.household_id)
    .maybeSingle();
  return {
    userId,
    householdId: profile.household_id,
    ledgerName: household?.name ?? "Homu",
    currency: household?.currency ?? "IDR",
  };
}

type Named = { id: string; name: string };

/**
 * Case-insensitive name lookup: exact match first, then a single unambiguous
 * prefix/substring match (so "dining" finds "Dining out"). Throws a helpful
 * error listing the valid names otherwise, so the calling agent can retry.
 */
function resolveByName<T extends Named>(items: T[], wanted: string, kind: string): T {
  const q = wanted.trim().toLowerCase();
  const exact = items.find((i) => i.name.toLowerCase() === q);
  if (exact) return exact;
  const partial = items.filter((i) => i.name.toLowerCase().includes(q));
  if (partial.length === 1) return partial[0];
  const names = items.map((i) => i.name).join(", ");
  throw new HomuToolError(
    partial.length > 1
      ? `"${wanted}" matches several ${kind}s (${partial.map((p) => p.name).join(", ")}). Use the exact name.`
      : `No ${kind} named "${wanted}". Available: ${names || "none"}.`
  );
}

async function fetchCategories(supabase: Client, ctx: HomuContext) {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, type")
    .eq("household_id", ctx.householdId)
    .order("name");
  if (error) throw new HomuToolError(`Couldn't load categories: ${error.message}`);
  return data ?? [];
}

async function fetchWallets(supabase: Client, ctx: HomuContext) {
  const { data, error } = await supabase
    .from("wallets")
    .select("id, name, initial_balance, is_default")
    .eq("household_id", ctx.householdId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new HomuToolError(`Couldn't load wallets: ${error.message}`);
  return data ?? [];
}

// ── list_wallets ─────────────────────────────────────────────────────

export async function listWallets(supabase: Client, ctx: HomuContext) {
  const wallets = await fetchWallets(supabase, ctx);

  // Same calculation as the Wallets screen: opening balance + income −
  // expenses, transfers included (they move money between wallets).
  const delta = new Map<string, number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("wallet_id, type, amount")
      .eq("household_id", ctx.householdId)
      .range(from, from + PAGE - 1);
    if (error) throw new HomuToolError(`Couldn't load transactions: ${error.message}`);
    for (const t of data ?? []) {
      if (!t.wallet_id) continue;
      const signed = (t.type === "income" ? 1 : -1) * Number(t.amount);
      delta.set(t.wallet_id, (delta.get(t.wallet_id) ?? 0) + signed);
    }
    if (!data || data.length < PAGE) break;
  }

  const rows = wallets.map((w) => ({
    name: w.name,
    balance: round2(Number(w.initial_balance ?? 0) + (delta.get(w.id) ?? 0)),
    is_default: w.is_default,
  }));
  return {
    ledger: ctx.ledgerName,
    currency: ctx.currency,
    total_balance: round2(rows.reduce((s, r) => s + r.balance, 0)),
    wallets: rows,
  };
}

// ── list_categories ──────────────────────────────────────────────────

export async function listCategories(supabase: Client, ctx: HomuContext) {
  const cats = await fetchCategories(supabase, ctx);
  return {
    ledger: ctx.ledgerName,
    expense: cats.filter((c) => c.type === "expense").map((c) => c.name),
    income: cats.filter((c) => c.type === "income").map((c) => c.name),
  };
}

// ── list_transactions ────────────────────────────────────────────────

export type ListTransactionsArgs = {
  from?: string;
  to?: string;
  type?: TxType;
  category?: string;
  wallet?: string;
  search?: string;
  limit?: number;
};

async function memberNames(supabase: Client, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map<string, string>();
  const { data } = await supabase.from("profiles").select("id, name").in("id", unique);
  return new Map((data ?? []).map((p) => [p.id, p.name ?? ""]));
}

export async function listTransactions(supabase: Client, ctx: HomuContext, args: ListTransactionsArgs) {
  const limit = args.limit ?? 50;
  const [cats, wallets] = await Promise.all([fetchCategories(supabase, ctx), fetchWallets(supabase, ctx)]);

  let query = supabase
    .from("transactions")
    .select("date, name, amount, type, category_id, wallet_id, created_by, transfer_pair_id")
    .eq("household_id", ctx.householdId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (args.from) query = query.gte("date", args.from);
  if (args.to) query = query.lte("date", args.to);
  if (args.type) query = query.eq("type", args.type);
  if (args.category) query = query.eq("category_id", resolveByName(cats, args.category, "category").id);
  if (args.wallet) query = query.eq("wallet_id", resolveByName(wallets, args.wallet, "wallet").id);
  if (args.search) {
    // Escape LIKE wildcards so a literal "%" or "_" in the search matches itself.
    const term = args.search.trim().replace(/[\\%_]/g, (m) => `\\${m}`);
    query = query.ilike("name", `%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw new HomuToolError(`Couldn't load transactions: ${error.message}`);
  const rows = data ?? [];

  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const walletName = new Map(wallets.map((w) => [w.id, w.name]));
  const people = await memberNames(supabase, rows.map((r) => r.created_by ?? ""));

  return {
    ledger: ctx.ledgerName,
    currency: ctx.currency,
    count: rows.length,
    more_available: rows.length === limit,
    transactions: rows.map((r) => ({
      date: r.date,
      description: r.name,
      amount: Number(r.amount),
      type: r.type,
      category: r.category_id ? catName.get(r.category_id) ?? null : null,
      wallet: r.wallet_id ? walletName.get(r.wallet_id) ?? null : null,
      added_by: r.created_by ? people.get(r.created_by) || null : null,
      transfer: r.transfer_pair_id !== null,
    })),
  };
}

// ── spending_summary ─────────────────────────────────────────────────

export type SummaryArgs = {
  from?: string;
  to?: string;
  type?: TxType;
  group_by?: "category" | "wallet" | "member" | "month";
};

export async function spendingSummary(supabase: Client, ctx: HomuContext, args: SummaryArgs) {
  const from = args.from ?? firstOfMonthUtc();
  const to = args.to ?? todayUtc();
  const type = args.type ?? "expense";
  const groupBy = args.group_by ?? "category";
  if (from > to) throw new HomuToolError(`"from" (${from}) is after "to" (${to}).`);

  const [cats, wallets] = await Promise.all([fetchCategories(supabase, ctx), fetchWallets(supabase, ctx)]);

  // Transfers are excluded, matching the app's ledger totals: moving money
  // between your own wallets isn't spending or income.
  const rows: { amount: number; category_id: string | null; wallet_id: string | null; created_by: string | null; date: string }[] = [];
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("amount, category_id, wallet_id, created_by, date")
      .eq("household_id", ctx.householdId)
      .eq("type", type)
      .is("transfer_pair_id", null)
      .gte("date", from)
      .lte("date", to)
      .range(off, off + PAGE - 1);
    if (error) throw new HomuToolError(`Couldn't load transactions: ${error.message}`);
    rows.push(...(data ?? []).map((r) => ({ ...r, amount: Number(r.amount) })));
    if (!data || data.length < PAGE) break;
  }

  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const walletName = new Map(wallets.map((w) => [w.id, w.name]));
  const people = groupBy === "member" ? await memberNames(supabase, rows.map((r) => r.created_by ?? "")) : new Map();

  const keyOf = (r: (typeof rows)[number]): string => {
    switch (groupBy) {
      case "wallet":
        return (r.wallet_id && walletName.get(r.wallet_id)) || "No wallet";
      case "member":
        return (r.created_by && people.get(r.created_by)) || "Unknown";
      case "month":
        return r.date.slice(0, 7);
      default:
        return (r.category_id && catName.get(r.category_id)) || "Uncategorized";
    }
  };

  const groups = new Map<string, { total: number; count: number }>();
  let total = 0;
  for (const r of rows) {
    const k = keyOf(r);
    const g = groups.get(k) ?? { total: 0, count: 0 };
    g.total += r.amount;
    g.count += 1;
    groups.set(k, g);
    total += r.amount;
  }

  const sorted = [...groups.entries()]
    .map(([name, g]) => ({
      name,
      total: round2(g.total),
      count: g.count,
      share_pct: total > 0 ? round2((g.total / total) * 100) : 0,
    }))
    .sort((a, b) => (groupBy === "month" ? a.name.localeCompare(b.name) : b.total - a.total));

  return {
    ledger: ctx.ledgerName,
    currency: ctx.currency,
    type,
    from,
    to,
    group_by: groupBy,
    total: round2(total),
    count: rows.length,
    groups: sorted,
  };
}

// ── list_ledgers ─────────────────────────────────────────────────────

/** Every ledger the user belongs to (names for add_pending_transaction). */
async function userLedgers(admin: Client, userId: string) {
  const { data: memberships } = await admin
    .from("household_members")
    .select("household_id")
    .eq("profile_id", userId);
  const ids = (memberships ?? []).map((m) => m.household_id);
  if (ids.length === 0) return [];
  const { data } = await admin.from("households").select("id, name, currency").in("id", ids).order("name");
  return data ?? [];
}

/** `admin` is the service-role client — membership is read for ctx.userId only. */
export async function listLedgers(admin: Client, ctx: HomuContext) {
  const ledgers = await userLedgers(admin, ctx.userId);
  return {
    current: ctx.ledgerName,
    ledgers: ledgers.map((l) => ({ name: l.name, currency: l.currency })),
  };
}

// ── add_pending_transaction ──────────────────────────────────────────
// Agents never write to a ledger directly (v1.48.0): they add to the
// user's Pending list, and the user accepts each item into a ledger of
// their choice in the app. Stored in the RAM-25 inbox_items table, which
// has no client INSERT policy — hence the service-role client, scoped
// explicitly to ctx.userId (taken from the verified OAuth token).

export type AddPendingArgs = {
  amount: number;
  description: string;
  type?: TxType;
  date?: string;
  currency?: string;
  merchant?: string;
  note?: string;
  ledger?: string;
  category?: string;
  wallet?: string;
  idempotency_key?: string;
};

export async function addPendingTransaction(admin: Client, ctx: HomuContext, args: AddPendingArgs) {
  const name = args.description.trim();
  const type: TxType = args.type ?? "expense";

  const err = validateName(name, LIMITS.TX_NAME, "Description") ?? validateAmount(args.amount);
  if (err) throw new HomuToolError(err);
  if (args.date && validateDate(args.date)) throw new HomuToolError(`Invalid date "${args.date}". Use YYYY-MM-DD.`);
  const currency = args.currency?.trim().toUpperCase();
  if (currency && !/^[A-Z]{3}$/.test(currency)) throw new HomuToolError(`Currency must be a 3-letter code like IDR or AUD.`);

  let ledger: string | undefined;
  if (args.ledger) {
    const ledgers = await userLedgers(admin, ctx.userId);
    const match = ledgers.find((l) => l.name.trim().toLowerCase() === args.ledger!.trim().toLowerCase());
    if (!match) {
      throw new HomuToolError(`No ledger named "${args.ledger}". Available: ${ledgers.map((l) => l.name).join(", ") || "none"}.`);
    }
    ledger = match.name;
  }

  const clean = (s?: string) => (s && s.trim() ? s.trim() : undefined);
  const parsed = {
    amount: args.amount,
    type,
    name,
    ...(args.date ? { date: args.date } : {}),
    ...(currency ? { currency } : {}),
    ...(clean(args.merchant) ? { merchant: clean(args.merchant) } : {}),
    ...(clean(args.note) ? { note: clean(args.note) } : {}),
    ...(ledger ? { ledger } : {}),
    ...(clean(args.category) ? { category: clean(args.category) } : {}),
    ...(clean(args.wallet) ? { wallet: clean(args.wallet) } : {}),
  };

  // (user_id, message_id) is unique, so a retry with the same key is a no-op.
  const messageId = args.idempotency_key
    ? `mcp:${createHash("sha256").update(`${ctx.userId}:${args.idempotency_key}`).digest("hex").slice(0, 32)}`
    : `mcp:${randomUUID()}`;

  const { error } = await admin.from("inbox_items").insert({
    user_id: ctx.userId,
    source_domain: "mcp",
    sender_email: "agent@mcp",
    message_id: messageId,
    received_at: new Date().toISOString(),
    raw_subject: name,
    raw_body: "",
    raw_body_format: "text",
    parsed,
    parse_method: "agent",
    parse_confidence: 1,
    status: "pending",
  });
  const alreadyPending = error?.code === "23505";
  if (error && !alreadyPending) throw new HomuToolError(`Couldn't add it to Pending: ${error.message}`);

  return {
    pending: true,
    already_pending: alreadyPending,
    message: "Added to Pending transactions. The user will review it and choose a ledger in the Homu app.",
    item: parsed,
  };
}

// ── list_pending_transactions ────────────────────────────────────────

export async function listPendingTransactions(supabase: Client, ctx: HomuContext) {
  // RLS ("select own") already scopes this; the explicit filter is defence
  // in depth.
  const { data, error } = await supabase
    .from("inbox_items")
    .select("received_at, parsed, source_domain")
    .eq("user_id", ctx.userId)
    .eq("status", "pending")
    .order("received_at", { ascending: false })
    .limit(100);
  if (error) throw new HomuToolError(`Couldn't load pending transactions: ${error.message}`);
  const rows = data ?? [];
  return {
    count: rows.length,
    pending: rows.map((r) => {
      const p = (r.parsed ?? {}) as Record<string, unknown>;
      return {
        added_at: r.received_at,
        source: r.source_domain === "mcp" ? "agent" : r.source_domain,
        description: p.name ?? null,
        amount: p.amount ?? null,
        currency: p.currency ?? null,
        type: p.type ?? null,
        date: p.date ?? null,
        merchant: p.merchant ?? null,
        suggested_ledger: p.ledger ?? null,
      };
    }),
  };
}
