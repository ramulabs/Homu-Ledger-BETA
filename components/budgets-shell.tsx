"use client";

// RAM-5 — Settings → Budgets list.
//
// Shows EVERY expense category. Rows with a cap render the inline
// progress bar + "spent / cap" line; rows without a cap show a "Tap to
// set a cap" hint so the empty state is one tap from done. Tapping
// either kind opens the BudgetSheet.
//
// Layout follows wallets-shell / categories-shell: sticky header, single
// rounded card, divided rows, safe-area-inset top for iOS notch.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import BudgetProgress from "@/components/budget-progress";
import BudgetSheet from "@/components/budget-sheet";
import { useT } from "@/lib/i18n/provider";
import { formatAmount } from "@/lib/format";
import type { BudgetWithProgress, DbBudget, DbCategory } from "@/lib/types";
import type { IconStyle } from "@/lib/category-icons";

type Props = {
  initialBudgets: BudgetWithProgress[];
  expenseCategories: DbCategory[];
  currency: string;
  iconStyle?: IconStyle;
  loadError?: string | null;
};

export default function BudgetsShell({
  initialBudgets,
  expenseCategories,
  currency,
  iconStyle = "3d",
  loadError = null,
}: Props) {
  const router = useRouter();
  const t = useT();

  // Keep the budgets keyed by category_id so updates / removals are O(1).
  const [budgetsByCat, setBudgetsByCat] = useState<Map<string, BudgetWithProgress>>(
    () => new Map(initialBudgets.map((b) => [b.budget.category_id, b]))
  );

  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<DbCategory | null>(null);

  function openSheet(cat: DbCategory) {
    setActiveCategory(cat);
    setSheetOpen(true);
  }

  function handleSaved(budget: DbBudget, category: DbCategory) {
    setBudgetsByCat((prev) => {
      const next = new Map(prev);
      const existing = prev.get(budget.category_id);
      // Keep the existing spent — it'd be wrong to zero it on save.
      const spent = existing?.spent ?? 0;
      const ratio = budget.amount > 0 ? Math.max(spent / budget.amount, 0) : 0;
      const state: BudgetWithProgress["state"] =
        ratio >= 1 ? "over" : ratio >= 0.8 ? "warning" : "neutral";
      next.set(budget.category_id, { budget, category, spent, ratio, state });
      return next;
    });
  }

  function handleRemoved(category_id: string) {
    setBudgetsByCat((prev) => {
      const next = new Map(prev);
      next.delete(category_id);
      return next;
    });
  }

  // Sort: budgeted rows (worst first) → unbudgeted rows (alphabetical).
  const rows = useMemo(() => {
    const budgeted: DbCategory[] = [];
    const untracked: DbCategory[] = [];
    for (const c of expenseCategories) {
      if (budgetsByCat.has(c.id)) budgeted.push(c);
      else untracked.push(c);
    }
    budgeted.sort((a, b) => {
      const ra = budgetsByCat.get(a.id)?.ratio ?? 0;
      const rb = budgetsByCat.get(b.id)?.ratio ?? 0;
      return rb - ra;
    });
    return [...budgeted, ...untracked];
  }, [expenseCategories, budgetsByCat]);

  const activeBudget = activeCategory ? budgetsByCat.get(activeCategory.id) ?? null : null;

  return (
    <>
      <div className="pb-10">
        <header className="sticky top-[env(safe-area-inset-top)] z-20 flex items-center justify-between bg-[var(--background)]/95 px-5 pt-2 pb-2 backdrop-blur">
          <button
            onClick={() => router.back()}
            aria-label={t("common.back")}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--foreground)] ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.03)] active:scale-95 transition-transform"
          >
            <ChevronLeft className="h-[20px] w-[20px]" strokeWidth={2.25} />
          </button>
          <h1 className="text-[17px] font-semibold tracking-tight text-[var(--foreground)]">
            {t("budgets.title")}
          </h1>
          <div className="h-9 w-9" />
        </header>

        <p className="mx-5 mt-3 text-[13px] leading-snug text-[var(--label-secondary)]">
          {t("budgets.subtitle")}
        </p>

        {loadError && (
          <p className="mx-5 mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700 ring-1 ring-rose-200">
            {loadError}
          </p>
        )}

        <section className="mt-4">
          {expenseCategories.length === 0 ? (
            <p className="mx-5 rounded-2xl bg-[var(--surface)] px-4 py-10 text-center text-[14px] text-[var(--label-secondary)] ring-1 ring-black/[0.04]">
              {t("budgets.empty.title")}
            </p>
          ) : (
            <ul className="mx-5 overflow-hidden rounded-2xl bg-[var(--surface)] ring-1 ring-black/[0.04] divide-y divide-[var(--separator)]">
              {rows.map((cat) => (
                <BudgetRow
                  key={cat.id}
                  cat={cat}
                  progress={budgetsByCat.get(cat.id) ?? null}
                  currency={currency}
                  iconStyle={iconStyle}
                  onTap={openSheet}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      <BudgetSheet
        open={sheetOpen}
        category={activeCategory}
        existing={activeBudget}
        currency={currency}
        iconStyle={iconStyle}
        onClose={() => setSheetOpen(false)}
        onSaved={handleSaved}
        onRemoved={handleRemoved}
      />
    </>
  );
}

function BudgetRow({
  cat,
  progress,
  currency,
  iconStyle,
  onTap,
}: {
  cat: DbCategory;
  progress: BudgetWithProgress | null;
  currency: string;
  iconStyle: IconStyle;
  onTap: (c: DbCategory) => void;
}) {
  const t = useT();
  const over = progress?.state === "over";
  const warn = progress?.state === "warning";

  return (
    <li>
      <button
        onClick={() => onTap(cat)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left min-h-[64px] active:bg-black/[0.02] transition-colors"
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${cat.color}22` }}
        >
          <CategoryIcon
            symbol={cat.symbol}
            iconStyle={iconStyle}
            size={20}
            emojiSize="20px"
            color={iconStyle === "2d" ? cat.color : undefined}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-[15px] font-medium text-[var(--foreground)]">{cat.name}</p>
            {progress ? (
              <p
                className={
                  over
                    ? "shrink-0 text-[12.5px] font-semibold text-rose-600"
                    : warn
                    ? "shrink-0 text-[12.5px] font-semibold text-amber-700"
                    : "shrink-0 text-[12.5px] font-medium text-[var(--label-secondary)]"
                }
              >
                {formatAmount(progress.spent, currency)} / {formatAmount(progress.budget.amount, currency)}
              </p>
            ) : (
              <p className="shrink-0 text-[12.5px] text-[var(--label-tertiary)]">
                {t("budgets.tapToSet")}
              </p>
            )}
          </div>

          {progress ? (
            <div className="mt-2">
              <BudgetProgress ratio={progress.ratio} state={progress.state} />
              {over && (
                <p className="mt-1.5 text-[11.5px] font-semibold text-rose-600">
                  {t("budgets.over")}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-1 text-[12px] text-[var(--label-tertiary)]">{t("budgets.untracked")}</p>
          )}
        </div>

        <ChevronRight className="h-[18px] w-[18px] shrink-0 text-[var(--label-tertiary)]" strokeWidth={2} />
      </button>
    </li>
  );
}
