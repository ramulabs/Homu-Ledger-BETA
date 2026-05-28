// GET /api/cron/notify-recurring-due — RAM-9.
//
// Vercel cron pings this once per day. We find every recurring item
// whose `next_due_date` is today or tomorrow, dedupe against already-
// notified items (so the user doesn't get the same alert two days in
// a row for the same item), and dispatch via lib/notify.ts.
//
// We notify ALL members of the household (not just the creator of the
// recurring rule) — recurring items are shared across the household
// and someone besides the creator might be the one who pays the bill.
//
// Authentication: Vercel cron sends `Authorization: Bearer <CRON_SECRET>`
// (the same pattern used across the Vercel cron docs). We refuse any
// request without the header so this endpoint isn't a denial-of-service
// vector if someone curls it directly.

import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { sendNotificationToUser, type SendResult } from "@/lib/notify";
import { recurringDueCopy } from "@/lib/notification-copy";
import { checkCronAuth } from "@/lib/cron-auth";
import type { Lang } from "@/lib/i18n/dictionaries";

export const runtime = "nodejs";
// This endpoint MUST hit the DB on every invocation — no caching.
export const dynamic = "force-dynamic";

type Aggregate = {
  candidates: number;
  notified: number;
  alreadySeen: number;
  sends: SendResult;
};

export async function GET(req: NextRequest) {
  const authError = checkCronAuth(req);
  if (authError) return authError;

  const admin = getAdminClient();
  const today = new Date();
  const todayStr = isoDate(today);
  const tomorrowStr = isoDate(addDays(today, 1));

  // 1. Find recurring items due today/tomorrow. We pull household_id so
  // we can fan out to every household member.
  const { data: items, error: itemsErr } = await admin
    .from("recurring_items")
    .select("id, household_id, name, amount, type, next_due_date")
    .in("next_due_date", [todayStr, tomorrowStr]);

  if (itemsErr) {
    return NextResponse.json(
      { ok: false, error: itemsErr.message },
      { status: 500 }
    );
  }

  const result: Aggregate = {
    candidates: items?.length ?? 0,
    notified: 0,
    alreadySeen: 0,
    sends: { matched: 0, delivered: 0, reaped: 0, failed: 0 },
  };

  if (!items || items.length === 0) {
    return NextResponse.json({ ok: true, ...result });
  }

  // 2. Resolve household → currency + members in two batched queries so
  // we don't N+1 against the DB.
  const householdIds = Array.from(new Set(items.map((i) => i.household_id)));

  const { data: households } = await admin
    .from("households")
    .select("id, currency")
    .in("id", householdIds);
  const currencyByHousehold = new Map(
    (households ?? []).map((h) => [h.id, h.currency ?? "IDR"])
  );

  const { data: members } = await admin
    .from("household_members")
    .select("household_id, profile_id")
    .in("household_id", householdIds);

  const membersByHousehold = new Map<string, string[]>();
  for (const m of members ?? []) {
    const arr = membersByHousehold.get(m.household_id) ?? [];
    arr.push(m.profile_id);
    membersByHousehold.set(m.household_id, arr);
  }

  // Fetch languages once for all recipients we'll touch.
  const allRecipientIds = Array.from(
    new Set((members ?? []).map((m) => m.profile_id))
  );
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, language")
    .in("id", allRecipientIds);
  const langByProfile = new Map(
    (profiles ?? []).map((p) => [p.id, (p.language as Lang) ?? "en"])
  );

  // 3. For each (item × recipient), check dedup table and dispatch.
  for (const item of items) {
    const currency = currencyByHousehold.get(item.household_id) ?? "IDR";
    const recipients = membersByHousehold.get(item.household_id) ?? [];

    for (const userId of recipients) {
      const dedupKey = `recurring_due:${item.id}:${item.next_due_date}`;
      const { data: existing } = await admin
        .from("notification_dedup")
        .select("id")
        .eq("user_id", userId)
        .eq("key", dedupKey)
        .maybeSingle();

      if (existing) {
        result.alreadySeen += 1;
        continue;
      }

      const lang = langByProfile.get(userId) ?? "en";
      const copy = recurringDueCopy(lang, {
        itemName: item.name,
        amount: Number(item.amount),
        currency,
        dueDate: item.next_due_date as string,
        today: todayStr,
      });

      try {
        const send = await sendNotificationToUser(
          userId,
          {
            title: copy.title,
            body: copy.body,
            url: "/transactions?tab=recurring",
            tag: `recurring:${item.id}`,
          },
          "recurring_due",
          admin
        );
        accumulate(result.sends, send);
        if (send.delivered > 0) {
          result.notified += 1;
          // Record the dedup row only after a successful send so a
          // transient push-service hiccup doesn't suppress tomorrow's
          // retry.
          await admin
            .from("notification_dedup")
            .upsert({ user_id: userId, key: dedupKey }, { onConflict: "user_id,key" });
        }
      } catch (err) {
        console.warn(
          `[cron/notify-recurring-due] send to ${userId} failed:`,
          err instanceof Error ? err.message : err
        );
        result.sends.failed += 1;
      }
    }
  }

  return NextResponse.json({ ok: true, ...result });
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function accumulate(into: SendResult, from: SendResult) {
  into.matched += from.matched;
  into.delivered += from.delivered;
  into.reaped += from.reaped;
  into.failed += from.failed;
}

