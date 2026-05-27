// GET /api/cron/notify-budget-warnings — RAM-9.
//
// Daily check: for each category that has a budget set, compute the
// month-to-date spend. If it crossed 80% or 100% since the last time
// we notified, dispatch.
//
// Coordination with RAM-5 (Budgets)
// ──────────────────────────────────
// The `budgets` table is being built in a parallel scheduled agent
// (hello/ram-5-budgets). It may not have merged to main when this lands.
// We probe `information_schema.tables` once at the top of the handler;
// if absent, we log + return early with `ok: true, skipped: 'budgets-table-missing'`.
// When RAM-5 lands, this cron starts firing automatically — no change
// needed here.
//
// The schema we EXPECT (and will gracefully not-find if absent):
//   public.budgets
//     id uuid pk
//     household_id uuid
//     category_id uuid
//     amount numeric
//     period text  -- 'monthly' is what we handle here
//     (RLS irrelevant — we run as service-role)
//
// If RAM-5 lands with a different shape, the SELECT below will fail
// loudly and we'll update this cron in a follow-up. That's the right
// failure mode (loud) — silently parsing the wrong columns would be
// worse than a 500 in a single cron tick.

import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { sendNotificationToUser, type SendResult } from "@/lib/notify";
import { budgetWarningCopy } from "@/lib/notification-copy";
import { checkCronAuth } from "@/lib/cron-auth";
import type { Lang } from "@/lib/i18n/dictionaries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const THRESHOLDS = [80, 100] as const;
type Threshold = (typeof THRESHOLDS)[number];

export async function GET(req: NextRequest) {
  const authError = checkCronAuth(req);
  if (authError) return authError;

  const admin = getAdminClient();

  // ── 1. Does the budgets table exist? ──────────────────────────────
  // information_schema.tables is exposed via the postgres role + the
  // SECURITY DEFINER context the service-role key gets, but Supabase's
  // PostgREST doesn't surface it. Easiest path: try a HEAD select; if
  // PostgREST returns the well-known "table not found" code 42P01 we
  // know we're early. Anything else is a real error.
  type BudgetRow = {
    id: string;
    household_id: string;
    category_id: string;
    amount: number;
    period: string;
  };
  // Use a loose any-typed handle so we can probe an unknown table
  // without TypeScript blocking the build.
  const adminAny = admin as unknown as {
    from: (tbl: string) => {
      select: (cols: string, opts?: { count?: "exact"; head?: boolean }) => Promise<{
        error: { code?: string; message: string } | null;
        data: BudgetRow[] | null;
      }>;
    };
  };

  const probe = await adminAny.from("budgets").select("id", { count: "exact", head: true });
  if (probe.error) {
    const code = probe.error.code;
    if (code === "42P01" || /relation .* does not exist/i.test(probe.error.message)) {
      // RAM-5 hasn't landed yet — this is expected during the
      // overlap window. Return ok so Vercel doesn't flag the cron as
      // failing during normal operation.
      console.info(
        "[cron/notify-budget-warnings] budgets table not present — skipping. (Expected before RAM-5 merges.)"
      );
      return NextResponse.json({
        ok: true,
        skipped: "budgets-table-missing",
      });
    }
    return NextResponse.json(
      { ok: false, error: probe.error.message },
      { status: 500 }
    );
  }

  // ── 2. Pull every monthly budget ──────────────────────────────────
  const { data: budgets, error: budgetsErr } = await adminAny
    .from("budgets")
    .select("id, household_id, category_id, amount, period");
  if (budgetsErr) {
    return NextResponse.json(
      { ok: false, error: budgetsErr.message },
      { status: 500 }
    );
  }

  const monthlyBudgets = (budgets ?? []).filter((b) => b.period === "monthly");
  if (monthlyBudgets.length === 0) {
    return NextResponse.json({ ok: true, candidates: 0, notified: 0 });
  }

  // ── 3. Aggregate spend for each (household, category) month-to-date ─
  const monthStart = firstOfMonthIso();
  // Map key is `${household_id}|${category_id}` → sum of expense amounts MTD.
  const spendMap = new Map<string, number>();

  const householdIds = Array.from(new Set(monthlyBudgets.map((b) => b.household_id)));
  const categoryIds = Array.from(new Set(monthlyBudgets.map((b) => b.category_id)));

  const { data: txs, error: txErr } = await admin
    .from("transactions")
    .select("household_id, category_id, amount, type, date")
    .in("household_id", householdIds)
    .in("category_id", categoryIds)
    .eq("type", "expense")
    .gte("date", monthStart);
  if (txErr) {
    return NextResponse.json(
      { ok: false, error: txErr.message },
      { status: 500 }
    );
  }
  for (const t of txs ?? []) {
    if (!t.household_id || !t.category_id) continue;
    const key = `${t.household_id}|${t.category_id}`;
    spendMap.set(key, (spendMap.get(key) ?? 0) + Number(t.amount));
  }

  // Pre-fetch categories + households + members + langs so we don't N+1.
  const { data: cats } = await admin
    .from("categories")
    .select("id, name")
    .in("id", categoryIds);
  const catNameById = new Map((cats ?? []).map((c) => [c.id, c.name]));

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

  const allRecipients = Array.from(
    new Set((members ?? []).map((m) => m.profile_id))
  );
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, language")
    .in("id", allRecipients);
  const langByProfile = new Map(
    (profiles ?? []).map((p) => [p.id, (p.language as Lang) ?? "en"])
  );

  // ── 4. For each budget, decide if we crossed a threshold ──────────
  let candidates = 0;
  let notified = 0;
  const sends: SendResult = { matched: 0, delivered: 0, reaped: 0, failed: 0 };
  const monthKey = monthStart.slice(0, 7); // YYYY-MM

  for (const b of monthlyBudgets) {
    candidates += 1;
    const spent = spendMap.get(`${b.household_id}|${b.category_id}`) ?? 0;
    const pct = b.amount > 0 ? (spent / Number(b.amount)) * 100 : 0;

    // Pick the HIGHEST threshold crossed this month — if both 80 and 100
    // are crossed we only want one notification, the more urgent one.
    let crossed: Threshold | null = null;
    for (const t of THRESHOLDS) {
      if (pct >= t) crossed = t;
    }
    if (crossed === null) continue;

    const recipients = membersByHousehold.get(b.household_id) ?? [];
    const catName = catNameById.get(b.category_id) ?? "—";
    const currency = currencyByHousehold.get(b.household_id) ?? "IDR";

    for (const userId of recipients) {
      const dedupKey = `budget:${b.id}:${monthKey}:${crossed}`;
      const { data: dup } = await admin
        .from("notification_dedup")
        .select("id")
        .eq("user_id", userId)
        .eq("key", dedupKey)
        .maybeSingle();
      if (dup) continue;

      const lang = langByProfile.get(userId) ?? "en";
      const copy = budgetWarningCopy(lang, {
        categoryName: catName,
        percent: crossed,
        spent,
        budgetAmount: Number(b.amount),
        currency,
      });

      try {
        const send = await sendNotificationToUser(
          userId,
          {
            title: copy.title,
            body: copy.body,
            url: "/reports",
            // Same tag for both thresholds so the 100% notification
            // collapses the 80% one in the OS tray (the user sees
            // the latest, not stacked).
            tag: `budget:${b.id}:${monthKey}`,
          },
          "budget_warnings",
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
          `[cron/notify-budget-warnings] send to ${userId} failed:`,
          err instanceof Error ? err.message : err
        );
        sends.failed += 1;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    candidates,
    notified,
    sends,
  });
}

function firstOfMonthIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}
