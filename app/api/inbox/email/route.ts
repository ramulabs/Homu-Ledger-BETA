// POST /api/inbox/email — RAM-25 Phase 1.
//
// Inbound-email webhook for the default user path (forward bank emails →
// HOMU via Cloudflare Email Routing). The CF Worker receives the email,
// formats a JSON payload, signs it with CF_EMAIL_WEBHOOK_SECRET
// (HMAC-SHA256), and POSTs it here.
//
// Phase 1: the row lands in `inbox_items` with `parsed = null` —
// parsing wires up in Phase 2. n8n / power-user callers use
// /api/inbox/transactions instead (Bearer-authed, accepts pre-parsed
// payloads).
//
// Cloudflare Email Routing setup is the LAST step of Phase 1 (you'll
// configure the CF dashboard + deploy the Worker). Until then this
// endpoint returns 503 — any premature inbound POST shows up as a
// loud infra error, not a silent insert.

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import { resolveInboxAddress } from "@/lib/inbox/addresses";

export const runtime = "nodejs";

const WEBHOOK_SECRET_ENV = "CF_EMAIL_WEBHOOK_SECRET";

type CfEmailPayload = {
  to?: string;
  from?: { name?: string; email?: string };
  message_id?: string;
  date?: string;
  subject?: string;
  text?: string;
  html?: string;
};

export async function POST(req: NextRequest) {
  // ── 1. Webhook configured? ─────────────────────────────────────────
  const secret = process.env[WEBHOOK_SECRET_ENV];
  if (!secret) {
    return NextResponse.json(
      { error: "Email webhook not configured" },
      { status: 503 }
    );
  }

  // ── 2. Read raw body + verify signature ────────────────────────────
  const raw = await req.text();
  const signature = req.headers.get("x-homu-signature") ?? "";
  if (!verifySignature(raw, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: CfEmailPayload;
  try {
    payload = JSON.parse(raw) as CfEmailPayload;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  // ── 3. Resolve recipient → user ────────────────────────────────────
  const to = (payload.to ?? "").toLowerCase();
  const m = /^([^@]+)@inbox\.homu\.app$/i.exec(to);
  if (!m) {
    return NextResponse.json({ error: "Unknown recipient" }, { status: 404 });
  }
  const localPart = m[1];

  const admin = getAdminClient();
  const resolved = await resolveInboxAddress(admin, localPart);
  if (!resolved) {
    return NextResponse.json({ error: "Unknown recipient" }, { status: 404 });
  }

  // ── 4. Validate the rest ───────────────────────────────────────────
  const fromAddress = (payload.from?.email ?? "").toLowerCase();
  const sourceDomain = fromAddress.split("@")[1] ?? "";
  if (!fromAddress || !sourceDomain) {
    return NextResponse.json(
      { error: "Missing or malformed From: address" },
      { status: 400 }
    );
  }

  const messageId = payload.message_id;
  if (!messageId) {
    return NextResponse.json(
      { error: "Missing Message-ID header" },
      { status: 400 }
    );
  }

  const hasText = typeof payload.text === "string" && payload.text.length > 0;
  const hasHtml = typeof payload.html === "string" && payload.html.length > 0;
  if (!hasText && !hasHtml) {
    return NextResponse.json(
      { error: "Email body is empty (no text or html)" },
      { status: 400 }
    );
  }

  // ── 5. Insert (idempotent on user_id + message_id) ─────────────────
  const insertRow = {
    user_id: resolved.user_id,
    source_domain: sourceDomain,
    sender_email: fromAddress,
    message_id: messageId,
    received_at: payload.date ?? new Date().toISOString(),
    raw_subject: payload.subject ?? null,
    raw_body: hasText ? (payload.text as string) : (payload.html as string),
    raw_body_format: hasText ? "text" : "html",
    parsed: null,
    parse_method: null, // Phase 2 will fill these in
    parse_confidence: null,
    status: "pending" as const,
  };

  const { data, error } = await admin
    .from("inbox_items")
    .insert(insertRow)
    .select("id")
    .single();

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ duplicate: true }, { status: 200 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { id: data.id, status: "pending" },
    { status: 201 }
  );
}

function verifySignature(body: string, signature: string, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
