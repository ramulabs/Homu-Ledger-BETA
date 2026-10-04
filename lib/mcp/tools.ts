// Tool definitions for the Homu MCP server. Wiring only — the data logic
// lives in lib/mcp/queries.ts.
//
// Scope: read everything; writes go to the user's Pending list only
// (v1.48.0). Nothing reaches a ledger until the user accepts it in the
// app and chooses which ledger it belongs to. No edit/delete.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { McpServer } from "@modelcontextprotocol/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createUserClient } from "@/lib/mcp/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  type HomuContext,
  HomuToolError,
  addPendingTransaction,
  listCategories,
  listLedgers,
  listPendingTransactions,
  listTransactions,
  listWallets,
  loadContext,
  spendingSummary,
} from "@/lib/mcp/queries";

export const HOMU_INSTRUCTIONS = `Homu is a shared expense tracker for couples and families. The user can have several ledgers (e.g. Personal, Business); read tools act on their current ledger.
- You cannot write to a ledger directly. Use add_pending_transaction: it goes to the user's Pending list, and they accept it into a ledger of their choice in the Homu app.
- Amounts are plain numbers. Pass "currency" when it isn't the ledger currency (see list_ledgers); the user enters the converted amount when accepting.
- Dates are YYYY-MM-DD in the user's local timezone. Pass the date the transaction actually happened when you know it.
- Suggest a ledger (list_ledgers), category (list_categories) and merchant when you can; Homu also learns the user's choices.
- Check list_pending_transactions first to avoid adding the same item twice, and always pass an idempotency_key.
- Transfers between the user's own wallets are excluded from spending_summary.`;

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

type ToolCtx = { http?: { authInfo?: { token: string; extra?: Record<string, unknown> } } };

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

/** Builds the user-scoped client + ledger context, and turns HomuToolErrors
 *  into tool-level errors the agent can read and recover from. */
async function run<T>(
  ctx: ToolCtx,
  fn: (supabase: SupabaseClient<Database>, homu: HomuContext) => Promise<T>
) {
  const auth = ctx.http?.authInfo;
  const userId = auth?.extra?.userId;
  if (!auth?.token || typeof userId !== "string") return fail("Not signed in to Homu. Reconnect the Homu app.");
  try {
    const supabase = createUserClient(auth.token);
    const homu = await loadContext(supabase, userId);
    return json(await fn(supabase, homu));
  } catch (err) {
    if (err instanceof HomuToolError) return fail(err.message);
    console.error("[mcp] tool failed", err);
    return fail("Homu hit an unexpected error. Please try again.");
  }
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;

export function registerHomuTools(server: McpServer) {
  server.registerTool(
    "list_wallets",
    {
      title: "List wallets and balances",
      description: "List the ledger's wallets with their current balances, plus the total balance and the ledger currency.",
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    async (_args, ctx) => run(ctx, (supabase, homu) => listWallets(supabase, homu))
  );

  server.registerTool(
    "list_categories",
    {
      title: "List categories",
      description: "List the ledger's expense and income category names.",
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    async (_args, ctx) => run(ctx, (supabase, homu) => listCategories(supabase, homu))
  );

  server.registerTool(
    "list_transactions",
    {
      title: "List transactions",
      description:
        "List transactions, newest first, with optional filters. Returns date, description, amount, type, category, wallet and who added it.",
      inputSchema: z.object({
        from: DATE.optional().describe("Start date, inclusive (YYYY-MM-DD)"),
        to: DATE.optional().describe("End date, inclusive (YYYY-MM-DD)"),
        type: z.enum(["expense", "income"]).optional(),
        category: z.string().max(60).optional().describe("Category name"),
        wallet: z.string().max(40).optional().describe("Wallet name"),
        search: z.string().max(100).optional().describe("Text to look for in the description"),
        limit: z.number().int().min(1).max(200).optional().describe("Max rows, default 50"),
      }),
      annotations: READ_ONLY,
    },
    async (args, ctx) => run(ctx, (supabase, homu) => listTransactions(supabase, homu, args))
  );

  server.registerTool(
    "spending_summary",
    {
      title: "Spending summary",
      description:
        "Total spending (or income) for a date range, grouped by category, wallet, member or month. Defaults to this month's expenses by category. Excludes transfers between wallets.",
      inputSchema: z.object({
        from: DATE.optional().describe("Start date, inclusive. Default: first day of this month"),
        to: DATE.optional().describe("End date, inclusive. Default: today"),
        type: z.enum(["expense", "income"]).optional().describe("Default: expense"),
        group_by: z.enum(["category", "wallet", "member", "month"]).optional().describe("Default: category"),
      }),
      annotations: READ_ONLY,
    },
    async (args, ctx) => run(ctx, (supabase, homu) => spendingSummary(supabase, homu, args))
  );

  server.registerTool(
    "list_ledgers",
    {
      title: "List ledgers",
      description: "List the names and currencies of every ledger the user belongs to, and which one is current.",
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    async (_args, ctx) => run(ctx, (_supabase, homu) => listLedgers(getAdminClient(), homu))
  );

  server.registerTool(
    "list_pending_transactions",
    {
      title: "List pending transactions",
      description: "List transactions waiting in the user's Pending list for approval, newest first.",
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    async (_args, ctx) => run(ctx, (supabase, homu) => listPendingTransactions(supabase, homu))
  );

  server.registerTool(
    "add_pending_transaction",
    {
      title: "Add a pending transaction",
      description:
        "Add an expense or income to the user's Pending list for approval. It is NOT recorded in any ledger until the user accepts it in the Homu app and chooses the ledger. Pass an idempotency_key so retries never create duplicates.",
      inputSchema: z.object({
        amount: z.number().positive().describe("Amount, e.g. 50000"),
        description: z.string().min(1).max(200).describe("What it was, e.g. 'Coffee at Kopi Kenangan'"),
        type: z.enum(["expense", "income"]).optional().describe("Default: expense"),
        date: DATE.optional().describe("When it happened, YYYY-MM-DD in the user's local timezone. If omitted, the day it was added is used"),
        currency: z.string().length(3).optional().describe("3-letter code, only if not the ledger currency (e.g. AUD)"),
        merchant: z.string().max(100).optional().describe("Merchant / payee name, e.g. 'Kopi Kenangan'"),
        note: z.string().max(500).optional().describe("Short context, e.g. 'from Grab receipt email'"),
        ledger: z.string().max(60).optional().describe("Suggested ledger name from list_ledgers"),
        category: z.string().max(60).optional().describe("Suggested category name"),
        wallet: z.string().max(40).optional().describe("Suggested wallet name"),
        idempotency_key: z.string().min(1).max(200).optional().describe("Stable unique key for this transaction"),
      }),
      // v1.48.1 — flagged read-only on purpose. Gemini (and other clients)
      // ask the user to confirm every tool that isn't read-only, and Spark
      // has no "always allow". This tool never touches a ledger: it only
      // queues a suggestion, and the user approves every item in Homu
      // (Accept + choose ledger) — Pending IS the review gate, so the
      // client-side prompt was a duplicate approval. Abuse is bounded by
      // AGENT_DAILY_CAP in lib/mcp/queries.ts.
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args, ctx) =>
      run(ctx, async (_supabase, homu) => {
        const result = await addPendingTransaction(getAdminClient(), homu, args);
        revalidatePath("/transactions");
        return result;
      })
  );
}
