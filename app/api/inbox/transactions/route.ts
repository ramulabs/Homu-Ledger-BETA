// POST /api/inbox/transactions — RAM-25 Phase 1.
//
// The n8n / power-user entry point. Bearer-authenticated; accepts either:
//   • a raw email body (HOMU will parse it in Phase 2), OR
//   • a pre-parsed { amount, type, name, date, currency } payload
//     (parse_method = 'manual', used as-is).
//
// Inserts a row into `inbox_items` for the resolved user. Idempotent on
// (user_id, message_id) — a duplicate POST returns 200 with
// { duplicate: true } and does NOT insert.

import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { verifyApiKey } from "@/lib/inbox/keys";
import type { Json } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

type Parsed = {
  amount?: unknown;
  type?: unknown;
  name?: unknown;
  date?: unknown;
  currency?: unknown;
  confidence?: unknown;
};

export async function POST(req: NextRequest) {
  // ── 1. Bearer auth ─────────────────────────────────────────────────
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(auth);
  if (!m) {
    return NextResponse.json(
      { error: "Missing or malformed Authorization header" },
      { status: 401 }
    );
  }
  const token = m[1];

  const admin = getAdminClient();
  const key = await verifyApiKey(token, admin);
  if (!key) {
    return NextResponse.json(
      { error: "Invalid or revoked API key" },
      { status: 401 }
    );
  }

  // ── 2. Parse + validate body ───────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const source_domain = str(body.source_domain);
  const message_id = str(body.message_id);
  const received_at = str(body.received_at);
  if (!source_domain || !message_id || !received_at) {
    return NextResponse.json(
      { error: "source_domain, message_id, and received_at are required" },
      { status: 400 }
    );
  }

  const raw_body = str(body.raw_body);
  const raw_subject = str(body.raw_subject);
  const sender_email = str(body.sender_email) ?? `noreply@${source_domain}`;

  const parsedIn =
    body.parsed && typeof body.parsed === "object" && !Array.isArray(body.parsed)
      ? (body.parsed as Parsed)
      : null;

  if (!parsedIn && !raw_body) {
    return NextResponse.json(
      { error: "Either `parsed` or `raw_body` must be provided" },
      { status: 400 }
    );
  }

  // ── 3. Insert (idempotent on user_id + message_id) ─────────────────
  const insertRow = {
    user_id: key.user_id,
    source_domain,
    sender_email,
    message_id,
    received_at,
    raw_subject,
    raw_body: raw_body ?? "",
    raw_body_format: "text",
    // The body came from JSON.parse so the shape is JSON-safe at runtime;
    // the cast just satisfies Postgrest's Json column type vs our loose
    // Parsed interface (which uses `unknown` for ergonomic guards above).
    parsed: parsedIn as unknown as Json | null,
    parse_method: parsedIn ? "manual" : null,
    parse_confidence: parsedIn
      ? typeof parsedIn.confidence === "number"
        ? parsedIn.confidence
        : 1.0
      : null,
    status: "pending" as const,
  };

  const { data, error } = await admin
    .from("inbox_items")
    .insert(insertRow)
    .select("id")
    .single();

  if (error) {
    // unique_violation on (user_id, message_id) → already journaled.
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ duplicate: true }, { status: 200 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { id: data.id, status: "pending", parsed: parsedIn },
    { status: 201 }
  );
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}
