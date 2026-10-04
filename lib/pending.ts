// Shared helpers for Pending transactions (v1.48.0). Pending items live in
// the RAM-25 `inbox_items` table: they belong to a USER, not a ledger, until
// accepted. Client- and server-safe (no Next / Supabase imports).

import { canonicalKey } from "@/lib/llm/normalize";

/** Fields a source (AI agent via MCP, API key, email parser) may suggest. */
export type PendingParsed = {
  amount?: number;
  type?: string;
  name?: string;
  date?: string;
  currency?: string;
  merchant?: string;
  note?: string;
  ledger?: string;
  category?: string;
  wallet?: string;
  confidence?: number;
};

export type PendingRow = {
  id: string;
  source_domain: string;
  raw_subject: string | null;
  received_at: string;
  parsed: PendingParsed | null;
  parse_method: string | null;
};

export const PENDING_SELECT = "id, source_domain, raw_subject, received_at, parsed, parse_method";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "Similar transaction" key for ledger learning: merchant if given, else description. */
export function pendingMatchKey(parsed: PendingParsed | null | undefined): string | null {
  const base = (parsed?.merchant || parsed?.name || "").trim();
  return base ? canonicalKey(base) : null;
}

/**
 * The date an accepted item gets: the date the source reported, else the
 * day it entered Pending (in the viewer's local timezone). Never the day
 * it is accepted.
 */
export function pendingDate(row: Pick<PendingRow, "parsed" | "received_at">): string {
  const d = row.parsed?.date;
  if (typeof d === "string" && ISO_DATE.test(d)) return d;
  const r = new Date(row.received_at);
  return `${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, "0")}-${String(r.getDate()).padStart(2, "0")}`;
}

/** Original currency when it differs from the ledger currency, else null. */
export function foreignCurrency(parsed: PendingParsed | null | undefined, ledgerCurrency: string): string | null {
  const c = typeof parsed?.currency === "string" ? parsed.currency.trim().toUpperCase() : "";
  return c && c !== ledgerCurrency.toUpperCase() ? c : null;
}
