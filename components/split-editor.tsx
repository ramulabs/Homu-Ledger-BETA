"use client";

// RAM-27 — SplitEditor
//
// A sub-form rendered inside AddTransactionSheet when the user taps the
// "Split" toggle. Lets one transaction be divided across multiple
// categories (e.g. Rp 450k at Hypermart → Rp 200k Groceries + Rp 150k
// Household + Rp 100k Personal Care).
//
// The parent keeps `splits` state; SplitEditor only calls `onChange`.
// The parent's Save button is disabled until `remaining === 0`.

import { useT } from "@/lib/i18n/provider";
import { CategoryIcon } from "@/components/category-icon";
import { cn } from "@/lib/cn";
import { Trash2, Plus, Split } from "lucide-react";
import type { DbCategory, SplitLineItem } from "@/lib/types";
import type { IconStyle } from "@/lib/category-icons";

type Props = {
  total: number;
  splits: SplitLineItem[];
  onChange: (splits: SplitLineItem[]) => void;
  categories: DbCategory[];
  iconStyle?: IconStyle;
};

/** Format a raw numeric value with dot-separated thousands (Indonesian style). */
function fmtAmount(n: number) {
  if (!n && n !== 0) return "0";
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Parse an Indonesian-formatted number string back to a JS number. */
function parseRawAmount(raw: string): number {
  const cleaned = raw.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

export default function SplitEditor({
  total,
  splits,
  onChange,
  categories,
  iconStyle = "3d",
}: Props) {
  const tr = useT();

  const sum = splits.reduce((acc, s) => acc + (s.amount ?? 0), 0);
  const remaining = total - sum;

  function addRow() {
    onChange([
      ...splits,
      { amount: Math.max(0, remaining), category_id: categories[0]?.id ?? "" },
    ]);
  }

  function removeRow(index: number) {
    onChange(splits.filter((_, i) => i !== index));
  }

  function updateRow(index: number, patch: Partial<SplitLineItem>) {
    onChange(
      splits.map((s, i) => (i === index ? { ...s, ...patch } : s))
    );
  }

  function splitEqually() {
    if (splits.length === 0) return;
    const base = Math.floor(total / splits.length);
    const remainder = Math.round(total - base * splits.length);
    onChange(
      splits.map((s, i) => ({
        ...s,
        amount: i === splits.length - 1 ? base + remainder : base,
      }))
    );
  }

  // Remaining indicator colour.
  const remainingColor =
    remaining === 0
      ? "text-emerald-600"
      : remaining < 0
      ? "text-rose-600"
      : "text-amber-600";

  return (
    <div className="flex flex-col gap-2">
      {/* Header row */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <Split className="h-4 w-4 text-[var(--label-secondary)]" strokeWidth={2} />
          <span className="text-[13px] font-semibold text-[var(--foreground)]">
            {tr("transaction.split")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {splits.length >= 2 && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={splitEqually}
              className="text-[12px] font-medium text-[var(--label-secondary)] hover:text-[var(--foreground)] transition-colors"
            >
              {tr("transaction.split.equally")}
            </button>
          )}
          <span className={cn("text-[12px] font-semibold tabular-nums", remainingColor)}>
            Rp {fmtAmount(Math.abs(remaining))} {tr("transaction.split.remaining")}
          </span>
        </div>
      </div>

      {/* Empty state */}
      {splits.length === 0 && (
        <p className="rounded-xl border border-dashed border-[var(--separator)] px-4 py-3 text-[13px] text-[var(--label-tertiary)] text-center">
          {tr("transaction.split.empty")}
        </p>
      )}

      {/* Split rows */}
      {splits.map((split, index) => {
        const cat = categories.find((c) => c.id === split.category_id) ?? null;
        return (
          <div
            key={index}
            className="flex flex-col gap-1.5 rounded-2xl border border-[var(--separator)] bg-[var(--background)] px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              {/* Amount input */}
              <div className="relative flex h-9 min-w-0 flex-1 items-center rounded-full border border-[var(--separator)] bg-[var(--surface)] px-3">
                <span className="shrink-0 text-[12px] font-medium text-[var(--label-secondary)]">Rp</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={split.amount ? fmtAmount(split.amount) : ""}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9,.]/g, "");
                    updateRow(index, { amount: parseRawAmount(raw) });
                  }}
                  placeholder="0"
                  aria-label={`Split amount ${index + 1}`}
                  className="min-w-0 flex-1 bg-transparent pl-1.5 text-[13px] font-semibold text-[var(--foreground)] tabular-nums outline-none placeholder:text-[var(--label-tertiary)]"
                />
              </div>

              {/* Category selector */}
              <div className="relative flex h-9 min-w-0 flex-[1.5] items-center gap-2 overflow-hidden rounded-full border border-[var(--separator)] bg-[var(--surface)] pl-2.5 pr-3">
                {cat && (
                  <span
                    className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${cat.color}26` }}
                  >
                    <CategoryIcon
                      symbol={cat.symbol}
                      iconStyle={iconStyle}
                      size={13}
                      emojiSize="12px"
                      color={iconStyle === "2d" ? cat.color : undefined}
                    />
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[var(--foreground)]">
                  {cat?.name ?? tr("tx.selectCategory")}
                </span>
                <select
                  value={split.category_id}
                  onChange={(e) => updateRow(index, { category_id: e.target.value })}
                  aria-label={`Split category ${index + 1}`}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  style={{ fontSize: 16 }}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Delete button */}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => removeRow(index)}
                aria-label={`Remove split ${index + 1}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--label-tertiary)] hover:bg-rose-50 hover:text-rose-600 transition-colors"
              >
                <Trash2 className="h-[15px] w-[15px]" strokeWidth={2} />
              </button>
            </div>

            {/* Optional notes */}
            <input
              type="text"
              value={split.notes ?? ""}
              onChange={(e) => updateRow(index, { notes: e.target.value || undefined })}
              placeholder={tr("tx.notePlaceholder")}
              aria-label={`Split notes ${index + 1}`}
              className="h-8 w-full rounded-full border border-[var(--separator)] bg-[var(--surface)] px-3 text-[12.5px] text-[var(--foreground)] outline-none placeholder:text-[var(--label-tertiary)] focus:border-[var(--foreground)]/30"
            />
          </div>
        );
      })}

      {/* Add split button */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={addRow}
        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-full border border-dashed border-[var(--separator)] bg-transparent text-[13px] font-medium text-[var(--label-secondary)] transition-colors hover:border-[var(--foreground)]/30 hover:text-[var(--foreground)]"
      >
        <Plus className="h-4 w-4" strokeWidth={2.25} />
        {tr("transaction.split.add")}
      </button>
    </div>
  );
}
