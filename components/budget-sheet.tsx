"use client";

// RAM-5 — Set / edit / remove a category's monthly budget cap.
//
// One sheet, two modes:
//   * The category has no cap yet  → "Set Budget" CTA + cancel.
//   * The category already has one → "Save Changes" + "Remove Budget" two-tap.
//
// Mirrors the bento-style edit-category-sheet keyboard handling so the
// sheet floats above the on-screen keyboard rather than getting buried.

import { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/provider";
import { formatAmount } from "@/lib/format";
import { removeBudget, setBudget } from "@/app/actions/budgets";
import type { BudgetWithProgress, DbBudget, DbCategory } from "@/lib/types";
import type { IconStyle } from "@/lib/category-icons";

type Props = {
  open: boolean;
  category: DbCategory | null;
  existing: BudgetWithProgress | null;
  currency: string;
  iconStyle?: IconStyle;
  onClose: () => void;
  onSaved: (budget: DbBudget, category: DbCategory) => void;
  onRemoved: (category_id: string) => void;
};

export default function BudgetSheet({
  open,
  category,
  existing,
  currency,
  iconStyle = "3d",
  onClose,
  onSaved,
  onRemoved,
}: Props) {
  const t = useT();
  const [amountRaw, setAmountRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate the input whenever the sheet opens with a fresh category.
  // The setState calls in this effect intentionally cascade once per
  // open — they're a controlled-form reset, not a derived-state loop.
  // Same pattern + same rationale as edit-category-sheet.tsx's open
  // effect; we accept the lint nudge here.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot controlled-form reset, same pattern as edit-category-sheet.
    setAmountRaw(existing ? String(Math.round(existing.budget.amount)) : "");
    setError(null);
    setLoading(false);
    setRemoving(false);
    setConfirmRemove(false);
  }, [open, existing, category?.id]);

  // Double-RAF visibility flip — same pattern as edit-category-sheet so
  // the slide-up transition always has a previous state to interpolate
  // from. Uses CSS transitions only (no rAF loop), so it pauses naturally
  // in a backgrounded WKWebView.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (open) {
      let r2: number | null = null;
      const r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(r1);
        if (r2) cancelAnimationFrame(r2);
      };
    }
    const r = requestAnimationFrame(() => setVisible(false));
    return () => cancelAnimationFrame(r);
  }, [open]);

  // Keep the bento above the on-screen keyboard via visualViewport.
  const [vvHeight, setVvHeight] = useState<number | null>(null);
  const [vvOffsetTop, setVvOffsetTop] = useState(0);
  useEffect(() => {
    if (!open) return;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    function update() {
      if (!vv) return;
      setVvHeight(vv.height);
      setVvOffsetTop(vv.offsetTop);
    }
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [open]);

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Strip everything except digits — formatAmount handles the comma /
    // dot separator on display, so we keep the raw value as digits-only.
    setAmountRaw(e.target.value.replace(/\D/g, ""));
  }

  const amountNumber = Number(amountRaw || "0");
  const previewDisplay = amountNumber > 0 ? formatAmount(amountNumber, currency) : formatAmount(0, currency);
  const canSave = !loading && !removing && amountNumber > 0 && !!category;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!category) return;
    setError(null);
    setLoading(true);
    const result = await setBudget({
      category_id: category.id,
      amount: amountNumber,
    });
    if (result.error || !result.budget) {
      setError(result.error ?? t("common.error"));
      setLoading(false);
      return;
    }
    onSaved(result.budget, category);
    onClose();
  }

  async function handleRemove() {
    if (!category || !existing) return;
    // Two-tap confirm. Mirrors edit-category-sheet so the muscle memory
    // matches across destructive actions.
    if (!confirmRemove) {
      setConfirmRemove(true);
      setTimeout(() => setConfirmRemove(false), 3000);
      return;
    }
    setRemoving(true);
    const result = await removeBudget(category.id);
    if (result.error) {
      setError(result.error);
      setRemoving(false);
      setConfirmRemove(false);
      return;
    }
    onRemoved(category.id);
    onClose();
  }

  return (
    <div
      className="fixed left-0 top-0 z-[100] w-full"
      style={{
        height: vvHeight != null ? `${vvHeight}px` : "100dvh",
        transform: `translateY(${vvOffsetTop}px)`,
        pointerEvents: open ? "auto" : "none",
      }}
    >
      <div
        onClick={onClose}
        className="absolute inset-0 flex items-end justify-center"
        style={{
          background: visible ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0)",
          backdropFilter: visible ? "blur(2px)" : "blur(0px)",
          WebkitBackdropFilter: visible ? "blur(2px)" : "blur(0px)",
          transition: visible
            ? "background 480ms ease, backdrop-filter 480ms ease"
            : "background 240ms ease, backdrop-filter 240ms ease",
          padding: "0 10px 18px",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex w-full max-w-md flex-col bg-[var(--surface)] text-[var(--foreground)]"
          style={{
            maxHeight: "92%",
            borderRadius: 28,
            boxShadow: "0 10px 30px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)",
            transform: visible ? "translateY(0)" : "translateY(110%)",
            transition: "transform 480ms cubic-bezier(0.32, 0.72, 0, 1)",
            paddingBottom: "max(0px, env(safe-area-inset-bottom))",
          }}
        >
          {/* Drag handle */}
          <div className="flex shrink-0 justify-center pb-2 pt-1.5">
            <div className="h-1 w-9 rounded-full bg-black/[0.16]" />
          </div>

          {/* Header */}
          <div className="flex shrink-0 items-center justify-between px-[18px] pb-2 pt-1">
            <span className="text-[15px] font-bold">
              {existing ? t("budgets.edit") : t("budgets.set")}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-black/[0.05] text-[var(--label-secondary)]"
              aria-label={t("common.close")}
            >
              <X className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>

          <form onSubmit={handleSave} className="flex min-h-0 flex-auto flex-col overflow-hidden">
            <div className="shrink-0 px-[18px]">
              {/* Category preview */}
              {category && (
                <div className="mb-3 flex items-center gap-3 rounded-[20px] bg-[var(--background)] px-3 py-2.5 ring-1 ring-black/[0.06]">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${category.color}26` }}
                  >
                    <CategoryIcon
                      symbol={category.symbol}
                      iconStyle={iconStyle}
                      size={20}
                      emojiSize="20px"
                      color={iconStyle === "2d" ? category.color : undefined}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-[var(--foreground)]">{category.name}</p>
                    {existing && (
                      <p className="mt-0.5 truncate text-[12px] text-[var(--label-secondary)]">
                        {t("budgets.spent")}: {formatAmount(existing.spent, currency)} {t("budgets.of")}{" "}
                        {formatAmount(existing.budget.amount, currency)}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Amount input */}
              <label className="mb-1.5 block text-[13px] font-medium text-[var(--label-secondary)]">
                {t("budgets.amount")} ({currency})
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={amountRaw}
                onChange={handleAmountChange}
                placeholder={t("budgets.amountPlaceholder")}
                aria-label={t("budgets.amount")}
                className="h-12 w-full rounded-2xl bg-[var(--background)] px-4 text-[15px] text-[var(--foreground)] outline-none ring-1 ring-black/[0.08] placeholder:text-[var(--label-tertiary)] focus:ring-2 focus:ring-[var(--foreground)]/20 transition-shadow"
              />
              <p className="mt-1.5 text-[12px] text-[var(--label-tertiary)]">
                {previewDisplay} · {t("budgets.thisMonth")}
              </p>

              {error && (
                <p className="mt-3 rounded-[12px] bg-rose-50 px-3.5 py-2 text-[12.5px] text-rose-700 ring-1 ring-rose-200">
                  {error}
                </p>
              )}
            </div>

            {/* Footer — save + (if editing) remove */}
            <div className="shrink-0 space-y-2 px-[18px] pb-4 pt-4">
              <button
                type="submit"
                disabled={!canSave}
                className="flex h-12 w-full items-center justify-center rounded-[18px] bg-[var(--foreground)] text-[14.5px] font-semibold text-[var(--on-foreground)] transition-opacity disabled:opacity-50"
              >
                {loading
                  ? t("common.saving")
                  : existing
                  ? t("common.saveChanges")
                  : t("budgets.set")}
              </button>
              {existing && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={loading || removing}
                  className={cn(
                    "flex h-11 w-full items-center justify-center gap-2 rounded-[16px] text-[14px] font-semibold transition-colors disabled:opacity-50",
                    confirmRemove ? "bg-rose-600 text-white" : "text-rose-600"
                  )}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2} />
                  {removing
                    ? t("common.loading")
                    : confirmRemove
                    ? t("common.confirm")
                    : t("budgets.remove")}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
