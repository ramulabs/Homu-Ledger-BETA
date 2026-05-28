"use server";

// RAM-9 — Push subscription server actions.
//
// Surface area:
//   subscribeToPush(sub, ua?)  — upsert a Web Push subscription for the
//                                current user. Called from the Settings
//                                Notifications form right after the
//                                browser hands us a PushSubscription.
//   unsubscribeFromPush(ep)    — soft-disable + delete the row for the
//                                given endpoint. Settings master OFF.
//   updateNotificationPrefs    — set per-type opt-ins on a subscription.
//   listUserSubscriptions      — read for the Settings page.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type WebPushSubscriptionJson = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type NotificationPrefs = {
  recurring_due: boolean;
  budget_warnings: boolean;
  daily_nudge: boolean;
};

export type DbPushSubscription = {
  id: string;
  provider: "web" | "apns" | "fcm";
  endpoint: string | null;
  enabled: boolean;
  prefs: NotificationPrefs;
  user_agent: string | null;
  created_at: string;
  last_used_at: string | null;
};

const DEFAULT_PREFS: NotificationPrefs = {
  recurring_due: true,
  budget_warnings: true,
  daily_nudge: false,
};

export async function subscribeToPush(
  subscription: WebPushSubscriptionJson,
  userAgent: string | null
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return { ok: false, error: "Invalid subscription" };
  }

  // Upsert on (provider, endpoint). If the same endpoint already exists
  // for a different user (very unlikely — endpoints are essentially
  // unique per browser+origin), the unique index will reject and we
  // surface the conflict; otherwise the existing row is re-enabled and
  // its user_agent / keys are refreshed.
  const { data, error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        provider: "web",
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        enabled: true,
        user_agent: userAgent,
      },
      { onConflict: "provider,endpoint" }
    )
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/settings/notifications");
  return { ok: true, id: data.id };
}

export async function unsubscribeFromPush(
  endpoint: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  // Hard delete — if the user comes back later we'll insert a fresh
  // row. Soft-disabled rows just confuse the Settings → Devices view.
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/notifications");
  return { ok: true };
}

export async function updateNotificationPrefs(
  subscriptionId: string,
  prefs: Partial<NotificationPrefs>
): Promise<{ ok: true; prefs: NotificationPrefs } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  // RLS already restricts to own rows; the WHERE here is belt-and-braces
  // and lets us reuse the same query for the upsert-by-id path.
  const { data: existing } = await supabase
    .from("push_subscriptions")
    .select("prefs")
    .eq("id", subscriptionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!existing) {
    return { ok: false, error: "Subscription not found" };
  }

  const current = (existing.prefs as Partial<NotificationPrefs> | null) ?? {};
  const merged: NotificationPrefs = {
    ...DEFAULT_PREFS,
    ...current,
    ...prefs,
  };

  const { error } = await supabase
    .from("push_subscriptions")
    .update({ prefs: merged })
    .eq("id", subscriptionId)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/notifications");
  return { ok: true, prefs: merged };
}

export async function listUserSubscriptions(): Promise<DbPushSubscription[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, provider, endpoint, enabled, prefs, user_agent, created_at, last_used_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return [];

  return (data ?? []).map((row) => ({
    id: row.id,
    provider: row.provider as DbPushSubscription["provider"],
    endpoint: row.endpoint,
    enabled: row.enabled,
    prefs: {
      ...DEFAULT_PREFS,
      ...((row.prefs as Partial<NotificationPrefs> | null) ?? {}),
    },
    user_agent: row.user_agent,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
  }));
}
