// API key helpers — RAM-25 Phase 1.
//
// Bearer tokens that authenticate the n8n / power-user path
// (`POST /api/inbox/transactions`). Generated server-side; the full key
// is returned ONCE to the user. We store SHA-256 of the key, never the
// raw token. SHA-256 (vs bcrypt) is fine here because the key has 256
// bits of entropy (32 random bytes, base64url-encoded) — slow-hashing is
// for low-entropy secrets like passwords, not for random API keys.

import { randomBytes, createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const KEY_PREFIX_STR = "homu_pk_";
// Prefix shown in the Settings UI. Includes the `homu_pk_` brand prefix
// (8 chars) plus 4 chars of the random payload so keys are visually
// distinguishable in a list.
export const KEY_PREFIX_LEN = KEY_PREFIX_STR.length + 4; // 12

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  // 32 random bytes → 43 base64url chars. Total key length 51.
  const random = randomBytes(32).toString("base64url");
  const key = KEY_PREFIX_STR + random;
  const prefix = key.slice(0, KEY_PREFIX_LEN);
  const hash = hashKey(key);
  return { key, prefix, hash };
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function isValidKeyFormat(key: string): boolean {
  return key.startsWith(KEY_PREFIX_STR) && key.length >= KEY_PREFIX_LEN + 20;
}

/**
 * Look the token up by its SHA-256 hash and return the owning user if
 * the key exists and isn't revoked. Best-effort updates `last_used_at`
 * after a successful lookup.
 */
export async function verifyApiKey(
  token: string,
  admin: SupabaseClient<Database>
): Promise<{ user_id: string; key_id: string } | null> {
  if (!isValidKeyFormat(token)) return null;
  const hash = hashKey(token);
  const { data, error } = await admin
    .from("user_api_keys")
    .select("id, user_id, revoked_at")
    .eq("key_hash", hash)
    .maybeSingle();
  if (error || !data) return null;
  if (data.revoked_at) return null;

  // Fire-and-forget last_used_at touch. Don't block the request on it.
  void admin
    .from("user_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return { user_id: data.user_id, key_id: data.id };
}
