"use server";

// Inbox / Integrations server actions — RAM-25 Phase 1.
//
// Backs the Settings → Integrations page. Generates API keys (Bearer
// tokens for the n8n / power-user path), revokes them, and provisions
// the user's <local>@inbox.homu.app forwarding address.

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getAdminClient } from "@/lib/supabase/admin";
import { generateApiKey } from "@/lib/inbox/keys";
import { ensureInboxAddress } from "@/lib/inbox/addresses";

export async function generateApiKeyAction(
  formData: FormData
): Promise<
  | { ok: true; key: string; prefix: string; id: string }
  | { ok: false; error: string }
> {
  const { user, profile } = await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Name is required." };
  if (name.length > 80) return { ok: false, error: "Name must be 80 characters or fewer." };

  const admin = getAdminClient();
  const { key, prefix, hash } = generateApiKey();

  const { data, error } = await admin
    .from("user_api_keys")
    .insert({
      user_id: user.id,
      key_prefix: prefix,
      key_hash: hash,
      name,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  // Provision the user's inbox address at the same time — power users
  // generally end up needing both, and ensureInboxAddress is idempotent.
  await ensureInboxAddress(admin, user.id, profile?.username ?? null);

  revalidatePath("/settings/integrations");
  return { ok: true, key, prefix, id: data.id };
}

export async function revokeApiKeyAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await requireSession();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Missing key id." };

  const admin = getAdminClient();
  const { error } = await admin
    .from("user_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/integrations");
  return { ok: true };
}

export async function ensureInboxAddressAction(): Promise<
  { ok: true; address: string; local_part: string } | { ok: false; error: string }
> {
  const { user, profile } = await requireSession();
  const admin = getAdminClient();
  try {
    const result = await ensureInboxAddress(admin, user.id, profile?.username ?? null);
    revalidatePath("/settings/integrations");
    return { ok: true, address: result.address, local_part: result.local_part };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to generate inbox address.",
    };
  }
}
