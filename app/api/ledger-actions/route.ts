import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addTransaction, updateTransaction, deleteTransaction, addTransfer } from "@/app/actions/transactions";
import { addRecurringItem } from "@/app/actions/recurring";
import { rejectInboxItemAction } from "@/app/actions/inbox";
import { acceptPendingAction, preparePendingAccept, findPendingDuplicates } from "@/app/actions/pending";
import { recordCategoryUsage } from "@/app/actions/ai";

const id = z.uuid();
const fields = z.record(z.string().max(64), z.string().max(2000)).refine((value) => Object.keys(value).length <= 24);
const operation = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["add", "transfer", "recurring"]), input: z.object({ fields }) }),
  z.object({ action: z.literal("update"), input: z.object({ id, fields }) }),
  z.object({ action: z.enum(["delete", "reject"]), input: z.object({ id }) }),
  z.object({ action: z.literal("prepare"), input: z.object({ itemId: id, householdId: id.optional(), description: z.string().max(200).optional(), type: z.enum(["income", "expense"]).optional() }) }),
  z.object({ action: z.literal("duplicates"), input: z.object({ householdId: id, amount: z.string().max(40), date: z.iso.date() }) }),
  z.object({ action: z.literal("accept"), input: z.object({ itemId: id, householdId: id, type: z.enum(["income", "expense"]), amount: z.string().max(40), name: z.string().max(200), categoryId: id.nullable(), walletId: id.nullable(), date: z.iso.date() }) }),
]);

function formData(value: Record<string, string>) {
  const data = new FormData();
  for (const [key, field] of Object.entries(value)) data.set(key, field);
  return data;
}

// Reuse the same authenticated, authorized mutation functions as Server
// Actions. In a Route Handler revalidatePath marks data stale without making
// the caller wait for a fresh /transactions render and all its queries.
export async function POST(request: NextRequest) {
  // Next normalizes localhost aliases in nextUrl. Validate against the actual
  // request host, retaining an exact scheme/host/port match behind Vercel too.
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? request.nextUrl.protocol.slice(0, -1);
  const expectedOrigin = `${protocol}://${host}`;
  if (request.headers.get("origin") !== expectedOrigin || !request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
  }
  const started = performance.now();
  try {
    const parsed = operation.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
    const { action, input } = parsed.data;
    let result: unknown;
    switch (action) {
      case "add": result = await addTransaction(formData(input.fields)); break;
      case "update": result = await updateTransaction(input.id, formData(input.fields)); break;
      case "delete": result = await deleteTransaction(input.id); break;
      case "transfer": result = await addTransfer(formData(input.fields)); break;
      case "recurring": result = await addRecurringItem(formData(input.fields)); break;
      case "reject": result = await rejectInboxItemAction(formData({ id: input.id })); break;
      case "accept": result = await acceptPendingAction(input); break;
      case "prepare": result = await preparePendingAccept(input); break;
      case "duplicates": result = { matches: await findPendingDuplicates(input) }; break;
    }
    if ((action === "add" || action === "update" || action === "recurring") && result && typeof result === "object" && !("error" in result)) {
      const { name, category_id } = input.fields;
      if (name && category_id) after(async () => {
        try { await recordCategoryUsage(name, category_id); }
        catch { console.warn("[ledger-action] Category hint could not be updated"); }
      });
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store", "Server-Timing": `ledger;dur=${(performance.now() - started).toFixed(1)}` } });
  } catch (error) {
    const signedOut = typeof error === "object" && error !== null && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT");
    if (!signedOut) console.error("[ledger-action] Request failed");
    return NextResponse.json({ ok: false, error: signedOut ? "Please sign in again." : "Unable to complete the request. Please try again." }, { status: signedOut ? 401 : 500 });
  }
}
