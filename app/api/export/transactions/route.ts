// Transaction export route handler (RAM-10).
//
// Returns either a CSV or PDF download containing all non-transfer
// transactions in the current ledger between two dates, inclusive.
//
//   GET /api/export/transactions?format=csv&start=2026-04-01&end=2026-04-30
//
// Auth + scope are enforced server-side:
//  - createClient() pulls the user's session cookie; auth.getUser() must
//    return a real user or we 401.
//  - The transactions query is filtered by household_id pulled from
//    profiles. RLS additionally enforces this — the explicit filter is
//    a belt-and-braces guard so a misconfigured RLS policy can't leak
//    rows across ledgers.
//
// Why a route handler and not a server action: server actions return data
// for React to render. We need a streamable file download with a
// Content-Disposition: attachment header, which is a Response thing.
// Route handlers also work cleanly with navigator.share's File payload
// path because we can fetch() the URL into a Blob on the client.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildCsv, buildPdf, exportFilename, type ExportRow, type ExportMeta } from "@/lib/export/transactions";
import type { Lang } from "@/lib/i18n/dictionaries";
import { getT } from "@/lib/i18n/dictionaries";

// Server-only — large query + PDF buffer. Node runtime gives us the
// streaming Buffer interop pdf-lib uses internally on top of TypedArrays.
export const runtime = "nodejs";
// Always fresh — exports must reflect the latest writes. No ISR magic.
export const dynamic = "force-dynamic";

const QUERY_PAGE_SIZE = 1000;

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function isValidDate(s: string | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const formatRaw = searchParams.get("format");
  const format = formatRaw === "pdf" ? "pdf" : formatRaw === "csv" ? "csv" : null;
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!format) {
    return NextResponse.json({ error: "format must be csv or pdf" }, { status: 400 });
  }
  if (!isValidDate(start) || !isValidDate(end)) {
    return NextResponse.json({ error: "start and end must be YYYY-MM-DD" }, { status: 400 });
  }
  if (start > end) {
    return NextResponse.json({ error: "start must be on or before end" }, { status: 400 });
  }

  // Resolve language + ledger context. We re-read the profile here rather
  // than reuse requireSession() because route handlers run in their own
  // request scope and the React.cache() in lib/auth/session.ts wouldn't
  // help us. Two reads is fine — both are sub-millisecond on the same
  // pooled connection.
  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id, language")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.household_id) {
    return NextResponse.json({ error: "No active ledger" }, { status: 400 });
  }

  const householdId = profile.household_id;
  const lang: Lang = (profile.language as Lang) ?? "en";
  const t = getT(lang);

  // Ledger details — name + currency for the file header / amount column.
  const { data: household } = await supabase
    .from("households")
    .select("id, name, currency")
    .eq("id", householdId)
    .single();
  if (!household) {
    return NextResponse.json({ error: "Ledger not found" }, { status: 404 });
  }

  // Reference lookups, fetched in parallel. Members come via the join
  // table since `created_by` points to a profile id, not directly to a
  // household_members row.
  const [{ data: categoriesRaw }, { data: walletsRaw }, { data: membersRaw }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name")
      .eq("household_id", householdId),
    supabase
      .from("wallets")
      .select("id, name")
      .eq("household_id", householdId),
    supabase
      .from("household_members")
      .select("profile:profiles(id, name)")
      .eq("household_id", householdId),
  ]);

  const categoryName = new Map<string, string>();
  for (const c of categoriesRaw ?? []) categoryName.set(c.id, c.name);
  const walletName = new Map<string, string>();
  for (const w of walletsRaw ?? []) walletName.set(w.id, w.name);
  const memberName = new Map<string, string>();
  for (const row of membersRaw ?? []) {
    const p = firstRelation(row.profile as { id: string; name: string | null } | { id: string; name: string | null }[] | null);
    if (p?.id) memberName.set(p.id, p.name ?? "—");
  }

  // Paginated query — Supabase caps select() at 1000 rows by default,
  // and a 12-month export of an active ledger can hit that. Mirrors the
  // pattern in app/(app)/reports/page.tsx's fetchReportTransactions().
  type Row = {
    date: string;
    type: "income" | "expense";
    amount: number;
    name: string;
    note: string | null;
    category_id: string | null;
    wallet_id: string | null;
    created_by: string | null;
  };

  const rawRows: Row[] = [];
  for (let from = 0; ; from += QUERY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("date, type, amount, name, note, category_id, wallet_id, created_by")
      .eq("household_id", householdId)
      // Exclude transfers — they're internal moves between wallets, not
      // real income/expense events. Including them would double-count
      // net activity (each transfer is two rows) and confuse downstream
      // spreadsheets summing the amount column.
      .is("transfer_pair_id", null)
      .gte("date", start)
      .lte("date", end)
      // Chronological order in the export — older first, which is how
      // accountants read transaction registers. Reports uses DESC because
      // a UI list shows most recent at top; here we flip it.
      .order("date", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + QUERY_PAGE_SIZE - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const batch = (data ?? []) as Row[];
    rawRows.push(...batch);
    if (batch.length < QUERY_PAGE_SIZE) break;
  }

  // Resolve labels — keeping a Uncategorized / — fallback so the column
  // is never blank, which matters for CSV spreadsheet hygiene.
  const uncategorisedLabel = t("export.uncategorized");
  const dashLabel = "—";
  const rows: ExportRow[] = rawRows.map((r) => ({
    date: r.date,
    type: r.type,
    amount: Number(r.amount),
    description: r.name,
    category: r.category_id ? (categoryName.get(r.category_id) ?? uncategorisedLabel) : uncategorisedLabel,
    wallet: r.wallet_id ? (walletName.get(r.wallet_id) ?? dashLabel) : dashLabel,
    member: r.created_by ? (memberName.get(r.created_by) ?? dashLabel) : dashLabel,
    note: r.note ?? "",
  }));

  const meta: ExportMeta = {
    ledgerName: household.name,
    currency: household.currency ?? "IDR",
    start,
    end,
    generatedAt: new Date().toISOString(),
    lang,
  };

  const filename = exportFilename(format, meta);

  if (format === "csv") {
    const bytes = buildCsv(rows, meta);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        // No-store so a stale CSV doesn't get served when the user
        // re-requests after adding a transaction.
        "Cache-Control": "no-store",
      },
    });
  }

  const bytes = await buildPdf(rows, meta);
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
