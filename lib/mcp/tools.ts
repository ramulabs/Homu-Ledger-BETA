// Tool definitions for the Homu MCP server. Wiring only — the data logic
// lives in lib/mcp/queries.ts.
//
// v1 scope: read everything + add transactions. No edit/delete: an agent
// mistake on a shared family ledger is costly to undo.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { McpServer } from "@modelcontextprotocol/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createUserClient } from "@/lib/mcp/auth";
import {
  type HomuContext,
  HomuToolError,
  addTransaction,
  listCategories,
  listTransactions,
  listWallets,
  loadContext,
  spendingSummary,
} from "@/lib/mcp/queries";

export const HOMU_INSTRUCTIONS = `Homu is a shared expense tracker for couples and families. Every tool acts on the signed-in user's current ledger, which may be shared with family members.
- Amounts are plain numbers in the ledger's currency (returned as "currency"; often IDR, where amounts have no decimals).
- Dates are YYYY-MM-DD. Always pass dates in the user's local timezone, including today's date when adding a transaction.
- Category and wallet arguments are names; call list_categories / list_wallets if unsure.
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
    "add_transaction",
    {
      title: "Add a transaction",
      description:
        "Record a new expense or income in the ledger. If no category is given, Homu categorises it from the description using its keyword rules; if that finds nothing it is saved uncategorised. Pass an idempotency_key when retrying so the transaction is never recorded twice.",
      inputSchema: z.object({
        amount: z.number().positive().describe("Amount in the ledger currency, e.g. 50000"),
        description: z.string().min(1).max(200).describe("What it was, e.g. 'Coffee at Kopi Kenangan'"),
        type: z.enum(["expense", "income"]).optional().describe("Default: expense"),
        category: z.string().max(60).optional().describe("Category name from list_categories"),
        wallet: z.string().max(40).optional().describe("Wallet name from list_wallets. Default: the default wallet"),
        date: DATE.optional().describe("YYYY-MM-DD in the user's local timezone. Pass it explicitly"),
        idempotency_key: z.string().min(1).max(200).optional().describe("Stable unique key for this transaction"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args, ctx) =>
      run(ctx, async (supabase, homu) => {
        const result = await addTransaction(supabase, homu, args);
        revalidatePath("/transactions");
        revalidatePath("/reports");
        return result;
      })
  );
}
