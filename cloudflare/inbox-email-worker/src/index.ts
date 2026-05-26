// HOMU Inbox Email Worker — RAM-25 Phase 1.
//
// Cloudflare Email Routing sends every email arriving on
// *@homuinbox.ramu.app here. This Worker parses the MIME body, builds
// the JSON payload HOMU's /api/inbox/email expects, signs it with
// HMAC-SHA256 against HOMU_WEBHOOK_SECRET, and POSTs it.
//
// The signature is the lowercase hex of HMAC-SHA256(secret, body) and
// is sent in the `X-Homu-Signature` header. HOMU recomputes + compares
// using timingSafeEqual; mismatches return 401.
//
// We deliberately DON'T reject the email on HOMU failure — rejection
// would bounce the forwarded message back to the user's mailbox, which
// they can't act on. Log + drop instead; CF email events that throw are
// hard-bounced.

import PostalMime from "postal-mime";

export interface Env {
  HOMU_WEBHOOK_URL: string;
  HOMU_WEBHOOK_SECRET: string;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    try {
      const rawBytes = await streamToUint8Array(message.raw);
      const parser = new PostalMime();
      const parsed = await parser.parse(rawBytes);

      const fromAddress = parsed.from?.address ?? message.from;
      const fromName = parsed.from?.name ?? "";
      const messageId =
        parsed.messageId ??
        message.headers.get("message-id") ??
        `<${Date.now()}@cf-worker>`;

      const payload = {
        to: message.to,
        from: { name: fromName, email: fromAddress },
        message_id: messageId,
        date: parsed.date ?? new Date().toISOString(),
        subject: parsed.subject ?? "",
        text: parsed.text ?? "",
        html: parsed.html ?? "",
      };

      const body = JSON.stringify(payload);
      const signature = await hmacSha256Hex(env.HOMU_WEBHOOK_SECRET, body);

      const res = await fetch(env.HOMU_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Homu-Signature": signature,
        },
        body,
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`HOMU responded ${res.status}: ${text}`);
      }
    } catch (e) {
      console.error(
        `Email worker error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  },
};

async function streamToUint8Array(
  stream: ReadableStream<Uint8Array>
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
