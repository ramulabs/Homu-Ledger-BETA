// Inbox address helpers — RAM-25 Phase 1.
//
// Each opted-in user gets a personal `<local_part>@inbox.homu.app`
// address. Generated server-side on first opt-in, idempotent thereafter.
// The local-part shape is `lower(username[0..7]) + "-" + 6 base32 random`
// — short enough to copy/paste comfortably and globally unique by
// construction (the random tail prevents collisions across users with
// the same username prefix).

import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Crockford-ish base32 — no I, L, O, U so the address is unambiguous to
// read aloud / type.
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

function randomTail(): string {
  const buf = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[buf[i] % ALPHABET.length];
  }
  return out;
}

function localPartFromUsername(username: string | null): string {
  const slug =
    (username ?? "user")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 8) || "user";
  return `${slug}-${randomTail()}`;
}

/**
 * Idempotent. Returns the user's inbox address, creating it if missing.
 * Retries on the (unlikely) random-tail collision; gives up after 5 tries.
 */
export async function ensureInboxAddress(
  admin: SupabaseClient<Database>,
  userId: string,
  username: string | null
): Promise<{ local_part: string; address: string }> {
  const { data: existing } = await admin
    .from("user_inbox_addresses")
    .select("local_part")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) {
    return {
      local_part: existing.local_part,
      address: addressFor(existing.local_part),
    };
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const local_part = localPartFromUsername(username);
    const { error } = await admin
      .from("user_inbox_addresses")
      .insert({ user_id: userId, local_part });
    if (!error) {
      return { local_part, address: addressFor(local_part) };
    }
    // 23505 = unique_violation; retry with a new tail. Anything else is
    // a hard error.
    if ((error as { code?: string }).code !== "23505") throw error;
  }
  throw new Error("Could not allocate an inbox address after 5 attempts.");
}

export function addressFor(localPart: string): string {
  return `${localPart}@inbox.homu.app`;
}

/**
 * Reverse lookup for the inbound-email webhook: given a `local_part`
 * extracted from the `to:` address, return the owning user (or null
 * if unknown — the webhook 404s on unknown recipients to avoid
 * accepting mail for addresses we never issued).
 */
export async function resolveInboxAddress(
  admin: SupabaseClient<Database>,
  localPart: string
): Promise<{ user_id: string } | null> {
  const { data } = await admin
    .from("user_inbox_addresses")
    .select("user_id")
    .eq("local_part", localPart)
    .maybeSingle();
  return data ? { user_id: data.user_id } : null;
}
