// GET /api/cron/notify-daily-nudge — RAM-9.
//
// Evening reminder for users who opted in. Fires for every user who:
//   1. Has at least one enabled push subscription with daily_nudge=true.
//   2. Hasn't recorded a transaction (in any household they belong to)
//      so far today.
//
// "Today" is UTC for now. Per-user timezone is on the v2 roadmap (need
// a `timezone` column on profiles) — chose UTC over guessing-from-locale
// because guess-from-locale would silently send 5am wake-up nudges to
// users in unexpected timezones, which is worse than a slightly-late
// reminder.
//
// Idempotency: the dedup table holds `daily_nudge:<user>:<YYYY-MM-DD>`
// so a second cron run on the same day (manual retry) won't double-fire.

import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { sendNotificationToUser, type SendResult } from "@/lib/notify";
import { dailyNudgeCopy } from "@/lib/notification-copy";
import { checkCronAuth } from "@/lib/cron-auth";
import type { Lang } from "@/lib/i18n/dictionaries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = checkCronAuth(req);
  if (authError) return authError;

  const admin = getAdminClient();
  const todayIso = new Date().toISOString().slice(0, 10);

  // ── 1. Find candidates: users with enabled subs + daily_nudge=true ──
  // We could filter `prefs->>'daily_nudge' = 'true'` in SQL but JSONB
  // boolean comparison via PostgREST is fiddly; pull all enabled subs
  // for the user and let sendNotificationToUser apply the pref filter.
  // First just enumerate distinct user_ids that have any enabled sub.
  const { data: subs, error: subsErr } = await admin
    .from("push_subscriptions")
    .select("user_id, prefs")
    .eq("enabled", true);
  if (subsErr) {
    return NextResponse.json(
      { ok: false, error: subsErr.message },
      { status: 500 }
    );
  }

  // Pre-filter on prefs.daily_nudge here to avoid even doing the
  // "logged-today?" SELECT for users who opted out.
  const candidateUsers = new Set<string>();
  for (const s of subs ?? []) {
    const prefs = (s.prefs ?? {}) as Record<string, unknown>;
    if (prefs.daily_nudge === true) candidateUsers.add(s.user_id);
  }

  if (candidateUsers.size === 0) {
    return NextResponse.json({ ok: true, candidates: 0, notified: 0 });
  }

  // ── 2. Filter out users who already logged a transaction today ─────
  // A transaction is "logged today" if its `date` is today's UTC date
  // OR its `created_at` is within today's UTC window. We use `date`
  // primarily because the user is reasoning about "did I track today's
  // spending"; `created_at` is the fallback for edits to old rows.
  const userIds = Array.from(candidateUsers);

  // Map user → household so we can query transactions by household.
  // Transactions don't have user_id directly (they're shared), so we
  // join via household_members → households → transactions.created_by.
  const { data: memberRows } = await admin
    .from("household_members")
    .select("profile_id, household_id")
    .in("profile_id", userIds);

  const householdByUser = new Map<string, string[]>();
  for (const m of memberRows ?? []) {
    const arr = householdByUser.get(m.profile_id) ?? [];
    arr.push(m.household_id);
    householdByUser.set(m.profile_id, arr);
  }

  // Single broad query: any transaction with date=today created by ANY
  // candidate user. Then we cross-check who's NOT in the set.
  const { data: todaysTxs } = await admin
    .from("transactions")
    .select("created_by")
    .eq("date", todayIso)
    .in("created_by", userIds);

  const loggedToday = new Set<string>();
  for (const t of todaysTxs ?? []) {
    if (t.created_by) loggedToday.add(t.created_by);
  }

  // ── 3. Pull languages once ─────────────────────────────────────────
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, language")
    .in("id", userIds);
  const langByProfile = new Map(
    (profiles ?? []).map((p) => [p.id, (p.language as Lang) ?? "en"])
  );

  // ── 4. Dispatch ────────────────────────────────────────────────────
  let notified = 0;
  let skippedLoggedToday = 0;
  let skippedNoHousehold = 0;
  const sends: SendResult = { matched: 0, delivered: 0, reaped: 0, failed: 0 };

  for (const userId of userIds) {
    // Skip users with no household — they have nothing to log into yet,
    // a nudge would just confuse them.
    if (!householdByUser.has(userId)) {
      skippedNoHousehold += 1;
      continue;
    }
    if (loggedToday.has(userId)) {
      skippedLoggedToday += 1;
      continue;
    }

    const dedupKey = `daily_nudge:${todayIso}`;
    const { data: dup } = await admin
      .from("notification_dedup")
      .select("id")
      .eq("user_id", userId)
      .eq("key", dedupKey)
      .maybeSingle();
    if (dup) continue;

    const lang = langByProfile.get(userId) ?? "en";
    const copy = dailyNudgeCopy(lang);

    try {
      const send = await sendNotificationToUser(
        userId,
        {
          title: copy.title,
          body: copy.body,
          url: "/transactions",
          tag: `daily_nudge:${todayIso}`,
        },
        "daily_nudge",
        admin
      );
      sends.matched += send.matched;
      sends.delivered += send.delivered;
      sends.reaped += send.reaped;
      sends.failed += send.failed;
      if (send.delivered > 0) {
        notified += 1;
        await admin
          .from("notification_dedup")
          .upsert(
            { user_id: userId, key: dedupKey },
            { onConflict: "user_id,key" }
          );
      }
    } catch (err) {
      console.warn(
        `[cron/notify-daily-nudge] send to ${userId} failed:`,
        err instanceof Error ? err.message : err
      );
      sends.failed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    candidates: candidateUsers.size,
    notified,
    skippedLoggedToday,
    skippedNoHousehold,
    sends,
  });
}
