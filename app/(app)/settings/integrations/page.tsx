// Settings → Integrations — RAM-25 Phase 1.
//
// Server component: reads the user's inbox address (if provisioned) +
// their active API keys, then hands them to the interactive client
// shell. All write actions live in app/actions/inbox.ts.

import { requireSession } from "@/lib/auth/session";
import { getAdminClient } from "@/lib/supabase/admin";
import { addressFor } from "@/lib/inbox/addresses";
import IntegrationsShell from "@/components/integrations-shell";

export default async function IntegrationsPage() {
  const { user } = await requireSession();
  const admin = getAdminClient();

  // Reads use the service-role admin client for two reasons:
  //   (1) lets us pull keys + address in parallel without making the
  //       page wait on two cookie-attached round-trips, and
  //   (2) RLS already restricts both tables to the owning user, so
  //       passing user.id in the WHERE keeps the scope correct.
  const [keysRes, addrRes] = await Promise.all([
    admin
      .from("user_api_keys")
      .select("id, name, key_prefix, scopes, created_at, last_used_at, revoked_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    admin
      .from("user_inbox_addresses")
      .select("local_part")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  // Filter out revoked keys at the server; the UI only shows active ones.
  const activeKeys = (keysRes.data ?? []).filter((k) => !k.revoked_at);

  return (
    <IntegrationsShell
      initialAddress={addrRes.data ? addressFor(addrRes.data.local_part) : null}
      keys={activeKeys}
    />
  );
}
