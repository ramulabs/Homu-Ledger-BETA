// RAM-9 — Notification dispatcher.
//
// `sendNotificationToUser(userId, payload, prefKey)` is the ONE entry
// point cron handlers (and any future event-driven sender) use to push
// a notification to a user. It hides the transport: today every enabled
// subscription is `provider='web'` and goes through `web-push`; tomorrow
// rows with `provider='apns'` will be routed to a Capacitor APNs sender
// (TBD), and `provider='fcm'` to Firebase Cloud Messaging (also TBD).
//
// Why this seam matters
// ─────────────────────
// Web Push doesn't work in iOS WKWebView (Apple's call). When we ship
// the iOS Capacitor build's native push integration, the dispatcher
// is the ONLY place that needs to learn about APNs. Cron handlers and
// notification-prefs UI stay still.
//
// Pref gating
// ───────────
// Every payload is tagged with a `prefKey` ('recurring_due',
// 'budget_warnings', 'daily_nudge'). We only send to subscriptions whose
// `prefs->>prefKey` is `'true'`. The user toggles each independently in
// Settings → Notifications.
//
// 410 Gone handling
// ─────────────────
// Push services return 410 (or sometimes 404) when a subscription is
// permanently dead — the user revoked permission, uninstalled the PWA,
// switched browsers, etc. The dispatcher reaps these rows so they
// don't accumulate forever.

import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { getAdminClient } from "@/lib/supabase/admin";

export type NotificationPrefKey =
  | "recurring_due"
  | "budget_warnings"
  | "daily_nudge";

export type NotificationPayload = {
  title: string;
  body: string;
  /** Pathname or full URL to focus when the user taps the notification. */
  url?: string;
  /** Collapse-key — if set, a new notification with the same tag
   *  replaces the previous one in the OS tray. Use for "budget at 80%
   *  → budget at 100%" sequences so the user sees the latest state,
   *  not an old + new pair. */
  tag?: string;
};

type AdminClient = SupabaseClient<Database>;

// Lazy init — VAPID details only need to be set once per process, but
// `setVapidDetails` throws if any of the three values are missing. We
// don't want module-load to crash a build that hasn't configured push
// yet; instead defer until first send.
let vapidConfigured = false;
function ensureVapidConfigured() {
  if (vapidConfigured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:ramu@ramu.app";
  if (!publicKey || !privateKey) {
    throw new Error(
      "Push notifications not configured — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in env."
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

export type SendResult = {
  /** Total subscription rows matched (after pref filter). */
  matched: number;
  /** Rows the dispatcher successfully delivered to a push service. */
  delivered: number;
  /** Rows reaped because the push service returned 410/404 (dead). */
  reaped: number;
  /** Rows that errored for any other reason — kept in the table. */
  failed: number;
};

/**
 * Send `payload` to every enabled subscription for `userId` whose
 * `prefs->>prefKey` is true. Returns counts so callers can log.
 *
 * Idempotency is the CALLER's responsibility — pass a `tag` if you want
 * the OS to collapse repeats, and use the `notification_dedup` table
 * (see migration 0034) to avoid re-sending the SAME alert from cron tick
 * to cron tick.
 *
 * If `admin` isn't passed, we instantiate one from env. Pass an explicit
 * client when you're already holding one (e.g. inside a route handler
 * that's done other admin work).
 */
export async function sendNotificationToUser(
  userId: string,
  payload: NotificationPayload,
  prefKey: NotificationPrefKey,
  admin?: AdminClient
): Promise<SendResult> {
  const supabase = admin ?? getAdminClient();

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, provider, endpoint, p256dh, auth, device_token, prefs")
    .eq("user_id", userId)
    .eq("enabled", true);

  if (error) {
    throw new Error(`push_subscriptions select failed: ${error.message}`);
  }

  // Filter for the per-type pref. We do this in JS rather than the SQL
  // filter because `prefs->>'key' = 'true'` is awkward to type-check
  // against the generated Database types and PostgREST string-coerces
  // JSON booleans, so the SQL form risks a silent miss when the value
  // is stored as a real boolean rather than a string. JS comparison is
  // safer + easier to debug.
  const enabledSubs = (subs ?? []).filter((sub) => {
    const prefs = (sub.prefs ?? {}) as Record<string, unknown>;
    return prefs[prefKey] === true;
  });

  const result: SendResult = {
    matched: enabledSubs.length,
    delivered: 0,
    reaped: 0,
    failed: 0,
  };

  const reapIds: string[] = [];
  const touchIds: string[] = [];

  await Promise.all(
    enabledSubs.map(async (sub) => {
      try {
        await dispatchOne(sub, payload);
        result.delivered += 1;
        touchIds.push(sub.id);
      } catch (err) {
        // web-push throws with `statusCode` on the error object for HTTP
        // responses; 404/410 means "this subscription is dead, please
        // stop trying". Anything else we keep (network blip, push
        // service hiccup, transient).
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          reapIds.push(sub.id);
          result.reaped += 1;
        } else {
          result.failed += 1;
          console.warn(
            `[notify] dispatch failed (provider=${sub.provider}, sub=${sub.id}):`,
            err instanceof Error ? err.message : err
          );
        }
      }
    })
  );

  // Reap dead rows. Best-effort — if the delete fails we'll just try
  // again next tick.
  if (reapIds.length > 0) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .in("id", reapIds);
  }

  // Touch `last_used_at` so the Settings → Devices view can show
  // freshness. Skip if we delivered to zero subs (avoids a no-op write).
  if (touchIds.length > 0) {
    await supabase
      .from("push_subscriptions")
      .update({ last_used_at: new Date().toISOString() })
      .in("id", touchIds);
  }

  return result;
}

type PushSubRow = {
  id: string;
  provider: string;
  endpoint: string | null;
  p256dh: string | null;
  auth: string | null;
  device_token: string | null;
  prefs: Json;
};

async function dispatchOne(sub: PushSubRow, payload: NotificationPayload): Promise<void> {
  switch (sub.provider) {
    case "web":
      return dispatchWeb(sub, payload);
    case "apns":
      throw new NotImplementedError(
        "APNs dispatch not implemented yet — pending @capacitor/push-notifications integration."
      );
    case "fcm":
      throw new NotImplementedError(
        "FCM dispatch not implemented yet — no native Android shell on the roadmap."
      );
    default:
      throw new Error(`Unknown push subscription provider: ${sub.provider}`);
  }
}

async function dispatchWeb(sub: PushSubRow, payload: NotificationPayload): Promise<void> {
  if (!sub.endpoint || !sub.p256dh || !sub.auth) {
    throw new Error(`Web subscription ${sub.id} missing required fields`);
  }
  ensureVapidConfigured();
  await webpush.sendNotification(
    {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    },
    JSON.stringify(payload),
    {
      // Time-to-live: how long the push service should hold the
      // notification if the device is offline. 24h is plenty for our
      // alerts — a "budget hit 100%" message from yesterday isn't
      // useful tomorrow.
      TTL: 24 * 60 * 60,
    }
  );
}

/**
 * Pref-gate helper for callers that have already loaded subscriptions
 * (e.g. when bundling multiple sends to the same user in a tight loop).
 * Exposed for unit tests; production callers use sendNotificationToUser.
 */
export function hasOptedIn(prefs: Json, prefKey: NotificationPrefKey): boolean {
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return false;
  return (prefs as Record<string, unknown>)[prefKey] === true;
}
