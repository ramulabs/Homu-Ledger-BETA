"use client";

// RAM-5 — Home-screen "Budget watch" card.
//
// Self-fetches budgets + spent via the same RPC the settings page uses.
// Renders the SINGLE worst-offending category (closest to or over its
// cap) so the user sees the most actionable signal without scrolling.
// If there are NO budgets at all the card hides itself entirely — same
// pattern as InboxChip.
//
// The card also exposes a hidden "View all" tap into /settings/budgets
// so a worried user can pivot from the home view straight to the list.
//
// Self-fetch (not server-rendered) so:
//   * The home page server fetch stays the same shape (no new prop).
//   * After a setBudget action the card refreshes on its next mount
//     without forcing a revalidate cascade on the home route.
//   * RLS-scoped client queries are safe — anonymous traffic just gets
//     zero rows back.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Target } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import BudgetProgress from "@/components/budget-progress";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/provider";
import { formatAmount } from "@/lib/format";
import type { BudgetWithProgress, DbBudget, DbCategory } from "@/lib/types";
import type { IconStyle } from "@/lib/category-icons";

type Props = {
  currency: string;
  iconStyle?: IconStyle;
  /** Parent bumps this to force a refetch (e.g. after a tx is added). */
  refreshSignal?: number;
};

type Row = BudgetWithProgress;

export default function BudgetWatchCard({ currency, iconStyle = "3d", refreshSignal = 0 }: Props) {
  const t = useT();
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const [budgetsRes, spentRes] = await Promise.all([
      supabase
        .from("budgets")
        .select("id, category_id, amount, currency, created_by, created_at, updated_at, category:categories(id, name, symbol, color, type, is_default)"),
      supabase.rpc("get_budget_spent_this_month"),
    ]);

    const spentMap = new Map<string, number>();
    for (const r of spentRes.data ?? []) {
      spentMap.set(r.category_id, Number(r.spent ?? 0));
    }

    const next: Row[] = [];
    for (const b of budgetsRes.data ?? []) {
      const categoryRaw = b.category as DbCategory | DbCategory[] | null;
      const category = Array.isArray(categoryRaw) ? categoryRaw[0] : categoryRaw;
      if (!category) continue;
      const amount = Number(b.amount ?? 0);
      const spent = spentMap.get(b.category_id) ?? 0;
      const ratio = amount > 0 ? Math.max(spent / amount, 0) : 0;
      const state: Row["state"] = ratio >= 1 ? "over" : ratio >= 0.8 ? "warning" : "neutral";
      const budget: DbBudget = {
        id: b.id,
        category_id: b.category_id,
        amount,
        currency: b.currency,
        created_by: b.created_by,
        created_at: b.created_at,
        updated_at: b.updated_at,
      };
      next.push({ budget, category, spent, ratio, state });
    }
    next.sort((a, b) => b.ratio - a.ratio);
    setRows(next);
    setLoaded(true);
  }, []);

  // First load + every time the parent bumps refreshSignal. The setState
  // happens inside `refresh()` (which is wrapped in useCallback), not in
  // the effect body — same pattern as InboxChip. The lint rule still
  // fires because Promise.resolve hops a microtask; we accept it for
  // consistency with the existing self-fetching home cards.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh, refreshSignal]);

  // Refresh on visibility — same trigger as the inbox chip so the card
  // catches up after the user comes back from another app.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") void refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const worst = useMemo(() => rows[0] ?? null, [rows]);

  // No budgets at all → hide. (Don't nag users into setting one — Settings
  // already has the entry point.)
  if (!loaded || rows.length === 0) return null;

  // All in the neutral state → render a tiny "all clear" line so the
  // surface stays informative without dominating the screen.
  const allNeutral = rows.every((r) => r.state === "neutral");

  return (
    <div className="px-5 pt-3">
      <Link
        href="/settings/budgets"
        className="block w-full rounded-2xl bg-[var(--surface)] px-4 py-3.5 ring-1 ring-black/[0.06] active:scale-[0.99] transition-transform [touch-action:manipulation]"
      >
        <div className="flex items-center gap-2 pb-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--foreground)]/[0.06] text-[var(--foreground)]">
            <Target className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          <p className="flex-1 text-[12.5px] font-semibold uppercase tracking-wide text-[var(--label-secondary)]">
            {t("budgets.home.title")}
          </p>
          <span className="inline-flex items-center gap-0.5 text-[12px] font-medium text-[var(--label-tertiary)]">
            {t("budgets.home.viewAll")}
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
        </div>

        {allNeutral || !worst ? (
          <p className="text-[13.5px] text-[var(--label-secondary)]">
            {t("budgets.home.allClear")}
          </p>
        ) : (
          <BudgetWatchRow row={worst} currency={currency} iconStyle={iconStyle} t={t} />
        )}
      </Link>
    </div>
  );
}

function BudgetWatchRow({
  row,
  currency,
  iconStyle,
  t,
}: {
  row: Row;
  currency: string;
  iconStyle: IconStyle;
  t: ReturnType<typeof useT>;
}) {
  const over = row.state === "over";
  const overBy = Math.max(row.spent - row.budget.amount, 0);

  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${row.category.color}22` }}
      >
        <CategoryIcon
          symbol={row.category.symbol}
          iconStyle={iconStyle}
          size={18}
          emojiSize="18px"
          color={iconStyle === "2d" ? row.category.color : undefined}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[13.5px] font-semibold text-[var(--foreground)]">
            {row.category.name}
          </p>
          <p
            className={
              over
                ? "shrink-0 text-[12px] font-semibold text-rose-600"
                : "shrink-0 text-[12px] font-medium text-amber-700"
            }
          >
            {over
              ? t("budgets.overBy").replace("{amount}", formatAmount(overBy, currency))
              : `${formatAmount(row.spent, currency)} / ${formatAmount(row.budget.amount, currency)}`}
          </p>
        </div>
        <div className="mt-1.5">
          <BudgetProgress ratio={row.ratio} state={row.state} />
        </div>
      </div>
    </div>
  );
}
