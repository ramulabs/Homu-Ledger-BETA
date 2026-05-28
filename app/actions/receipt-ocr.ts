"use server";

// Receipt-OCR server action — Gemini Vision parses a snapped receipt
// image into a structured draft for the Add Transaction sheet.
//
// Mirrors the voice-add architecture (`app/actions/voice.ts`):
//   • Same gemini_api_key from app_settings (developer-only RLS).
//   • Same retry-once on 5xx / network errors.
//   • Same api_usage_logs write so the dev panel tallies cost.
//   • Same bilingual prompt approach (we hint EN + ID).
//
// Vision-specific: the request body uses Gemini's `inlineData` part with
// a base64-encoded JPEG/PNG. We cap the upload at 8 MB before the call
// (the client compresses to ~400 KB via lib/compress-photo, so this is
// just a safety net for un-compressed paths).
//
// Output shape: { amount, currency, merchant, date, confidence } — the
// client uses confidence per field to decide pre-fill vs. leave-empty
// (threshold 0.6, set in the consuming component). The model is told
// to return null for any field it can't read.

import { createClient } from "@/lib/supabase/server";
import { GEMINI_DEFAULT_MODEL, GEMINI_PROVIDER } from "@/lib/llm/gemini";
import { estimateCostUsd } from "@/lib/llm/pricing";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const OCR_MAX_OUTPUT_TOKENS = 256;
const OCR_TIMEOUT_MS = 12_000;
const OCR_MAX_BYTES = 8 * 1024 * 1024; // 8 MB — client compresses to ~400 KB.

export type ReceiptOcrField<T> = {
  value: T | null;
  confidence: number; // 0..1; 0 when value is null.
};

export type ReceiptOcrParse = {
  amount: ReceiptOcrField<number>;
  currency: ReceiptOcrField<string>;
  merchant: ReceiptOcrField<string>;
  date: ReceiptOcrField<string>; // ISO YYYY-MM-DD
  /** Whether the model is at least somewhat convinced this is a real
   *  receipt. False → show the "doesn't look like a receipt" error. */
  isReceipt: boolean;
};

export type ReceiptOcrResult =
  | { ok: true; parse: ReceiptOcrParse; tokensIn: number; tokensOut: number }
  | { ok: false; error: string; unconfigured?: boolean };

// ── Auth gate ────────────────────────────────────────────────────────
//
// We re-use the voice-style "developer-only" gate. Receipt OCR is in
// the same beta blast-radius as voice transactions and shares the
// Gemini key; until we promote the feature broadly, the same check
// keeps things consistent. Mirrors requireVoiceAccess() in voice.ts.
async function requireOcrAccess(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("is_developer")
    .eq("id", user.id)
    .maybeSingle();
  if (!profileRow?.is_developer) {
    return { ok: false, error: "Receipt OCR is limited to developers right now." };
  }
  return { ok: true, supabase };
}

// ── Main entry ───────────────────────────────────────────────────────

export async function parseReceiptPhoto(
  formData: FormData
): Promise<ReceiptOcrResult> {
  const access = await requireOcrAccess();
  if (!access.ok) return { ok: false, error: access.error };
  const supabase = access.supabase;

  const raw = formData.get("photo");
  if (!raw || typeof raw === "string") {
    return { ok: false, error: "No photo attached." };
  }
  const file = raw as Blob;
  if (file.size === 0) {
    return { ok: false, error: "Photo is empty." };
  }
  if (file.size > OCR_MAX_BYTES) {
    return { ok: false, error: "Photo too large (max 8 MB)." };
  }
  // Default to image/jpeg when the Blob has no recognised type — the
  // client-side compressPhoto() always re-encodes to JPEG so this is
  // the realistic default. Gemini accepts both.
  const mimeType = file.type && file.type.startsWith("image/") ? file.type : "image/jpeg";

  // Optional language hint — passed by the client when the user has
  // set their household ai_language. We tell the model the receipt
  // is probably in that language so it doesn't mis-OCR Indonesian
  // merchant names as English (mirrors the categorize() pattern).
  const languageHint = (formData.get("language_hint") as string | null) ?? "auto";

  // ── Read the Gemini key (same pattern as voice.ts) ─────────────────
  const { data: keyRow } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "gemini_api_key")
    .maybeSingle();
  const apiKey = keyRow?.value?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error:
        "Receipt OCR requires a Gemini API key. Configure it in Settings → AI admin.",
      unconfigured: true,
    };
  }

  // ── Base64-encode the image for Gemini's inlineData part ───────────
  let base64: string;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    base64 = buf.toString("base64");
  } catch (err) {
    return {
      ok: false,
      error: `Could not read photo: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }

  // ── Build the prompt (bilingual EN + ID aware) ─────────────────────
  const languageNote =
    languageHint === "id"
      ? "The receipt is most likely in Bahasa Indonesia. Common labels: " +
        "TOTAL, JUMLAH, BAYAR, KEMBALIAN, PPN. Indonesian numbers use a " +
        "dot (.) as the thousands separator (e.g. Rp45.000 = 45000)."
      : languageHint === "en"
      ? "The receipt is most likely in English."
      : "The receipt may be in English or Bahasa Indonesia. Be tolerant of " +
        "Indonesian formatting: a dot (.) is the thousands separator " +
        "(Rp45.000 = 45000), not a decimal point.";

  const prompt =
    `You are a receipt OCR engine. Look at the attached photo and return ONE JSON ` +
    `object with the structured fields below. Do NOT include any commentary or ` +
    `code fences — JSON only.\n\n` +
    `${languageNote}\n\n` +
    `Return EXACTLY this shape:\n` +
    `{\n` +
    `  "isReceipt": boolean,\n` +
    `  "amount":   { "value": number | null, "confidence": number },\n` +
    `  "currency": { "value": string | null, "confidence": number },\n` +
    `  "merchant": { "value": string | null, "confidence": number },\n` +
    `  "date":     { "value": string | null, "confidence": number }\n` +
    `}\n\n` +
    `Rules:\n` +
    `- isReceipt: true if the image clearly shows a sales receipt, invoice, ` +
    `  or bill. false for unrelated photos (pets, landscapes, screenshots, etc.).\n` +
    `- amount.value: the GRAND TOTAL paid, as a positive whole number in the ` +
    `  smallest unit the receipt uses (e.g. 45000 for "Rp 45.000", 12 for ` +
    `  "$12"). Ignore subtotals, tip lines, change-due. Strip currency symbols ` +
    `  and thousands separators.\n` +
    `- currency.value: ISO 4217 code if you can determine it (IDR, USD, SGD, ` +
    `  MYR, EUR, etc.). Use IDR for any "Rp" prefix.\n` +
    `- merchant.value: the store / restaurant name. Strip suffixes like ` +
    `  "PT", "CV", branch numbers. Title-case the result.\n` +
    `- date.value: ISO format YYYY-MM-DD. If only DD/MM/YYYY visible, ` +
    `  convert it. If the year is unclear, assume the current year.\n` +
    `- confidence: 0.0 to 1.0. Use 0 when value is null. Be honest — a ` +
    `  blurry, partial, or guessed value should be < 0.6 so the client can ` +
    `  leave the field empty.\n` +
    `- If isReceipt is false, set every value to null with confidence 0.\n\n` +
    `Output the JSON now.`;

  // ── Call Gemini Vision ────────────────────────────────────────────
  async function callGemini(): Promise<Response | { networkErr: Error }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);
    try {
      return await fetch(
        `${GEMINI_API_BASE}/models/${encodeURIComponent(GEMINI_DEFAULT_MODEL)}:generateContent?key=${encodeURIComponent(apiKey!)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType,
                      data: base64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.0,
              responseMimeType: "application/json",
              maxOutputTokens: OCR_MAX_OUTPUT_TOKENS,
            },
          }),
          signal: controller.signal,
        }
      );
    } catch (err) {
      return { networkErr: err as Error };
    } finally {
      clearTimeout(timeout);
    }
  }

  // Retry-once on transient errors — same heuristic as voice.ts.
  let res: Response;
  const first = await callGemini();
  if ("networkErr" in first) {
    await new Promise((r) => setTimeout(r, 250));
    const second = await callGemini();
    if ("networkErr" in second) {
      return { ok: false, error: `Gemini call failed: ${second.networkErr.message}` };
    }
    res = second;
  } else if (first.status === 429 || first.status >= 500) {
    await new Promise((r) => setTimeout(r, 250));
    const second = await callGemini();
    if ("networkErr" in second) {
      return { ok: false, error: `Gemini call failed: ${second.networkErr.message}` };
    }
    res = second;
  } else {
    res = first;
  }

  if (!res.ok) {
    return { ok: false, error: `Gemini ${res.status}` };
  }

  type GeminiResp = {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
    };
  };
  const json = (await res.json()) as GeminiResp;
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  const tokensIn = json.usageMetadata?.promptTokenCount ?? 0;
  const tokensOut = json.usageMetadata?.candidatesTokenCount ?? 0;

  // Best-effort usage log — same as voice_parse.
  try {
    await supabase.rpc("log_api_usage", {
      p_provider: GEMINI_PROVIDER,
      p_model: GEMINI_DEFAULT_MODEL,
      p_input_tokens: tokensIn,
      p_output_tokens: tokensOut,
      p_estimated_cost: estimateCostUsd(GEMINI_DEFAULT_MODEL, tokensIn, tokensOut),
      p_feature: "receipt_ocr",
      p_cache_status: "miss",
      // No preview field — we don't want to log OCR text snippets to
      // the dev panel. Receipts contain PII (cards, addresses). Pass
      // undefined to take the column DEFAULT NULL path.
      p_preview: undefined,
    });
  } catch {
    /* swallow logging failures */
  }

  const parse = safeParseOcr(text);
  if (!parse) {
    return { ok: false, error: "Couldn't read the receipt — please try again." };
  }
  return { ok: true, parse, tokensIn, tokensOut };
}

// ── JSON shape validation ────────────────────────────────────────────
//
// Gemini occasionally wraps JSON in ```json fences despite
// responseMimeType. Strip them and validate the discriminated shape;
// anything off-shape falls back to "couldn't read" rather than feeding
// garbage to the UI.

function safeParseOcr(raw: string): ReceiptOcrParse | null {
  let stripped = raw.trim();
  if (!stripped) return null;
  if (stripped.startsWith("```")) {
    stripped = stripped
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  const isReceipt = obj.isReceipt === true;

  return {
    isReceipt,
    amount: coerceNumberField(obj.amount),
    currency: coerceStringField(obj.currency),
    merchant: coerceStringField(obj.merchant),
    date: coerceDateField(obj.date),
  };
}

function coerceConfidence(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  if (raw < 0) return 0;
  if (raw > 1) return 1;
  return raw;
}

function coerceNumberField(raw: unknown): ReceiptOcrField<number> {
  if (!raw || typeof raw !== "object") return { value: null, confidence: 0 };
  const obj = raw as { value?: unknown; confidence?: unknown };
  const rawValue = obj.value;
  let value: number | null = null;
  if (typeof rawValue === "number" && Number.isFinite(rawValue) && rawValue > 0) {
    value = Math.round(rawValue);
  } else if (typeof rawValue === "string") {
    // Tolerate string numbers like "45000" or "45.000". Strip dots
    // (Indonesian thousands separator) and commas before parsing.
    const cleaned = rawValue.replace(/[.,]/g, "").trim();
    const n = Number(cleaned);
    if (Number.isFinite(n) && n > 0) value = Math.round(n);
  }
  return {
    value,
    confidence: value === null ? 0 : coerceConfidence(obj.confidence),
  };
}

function coerceStringField(raw: unknown): ReceiptOcrField<string> {
  if (!raw || typeof raw !== "object") return { value: null, confidence: 0 };
  const obj = raw as { value?: unknown; confidence?: unknown };
  const rawValue = obj.value;
  let value: string | null = null;
  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (trimmed) value = trimmed;
  }
  return {
    value,
    confidence: value === null ? 0 : coerceConfidence(obj.confidence),
  };
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function coerceDateField(raw: unknown): ReceiptOcrField<string> {
  if (!raw || typeof raw !== "object") return { value: null, confidence: 0 };
  const obj = raw as { value?: unknown; confidence?: unknown };
  const rawValue = obj.value;
  let value: string | null = null;
  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    const m = trimmed.match(ISO_DATE_RE);
    if (m) {
      const [, y, mo, d] = m;
      const year = Number(y);
      const month = Number(mo);
      const day = Number(d);
      // Sanity-bound the date so an OCR'd "2099-13-45" doesn't sneak
      // through the input[type=date] validation downstream.
      if (
        year >= 1990 &&
        year <= 2100 &&
        month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= 31
      ) {
        value = `${y}-${mo}-${d}`;
      }
    }
  }
  return {
    value,
    confidence: value === null ? 0 : coerceConfidence(obj.confidence),
  };
}
