"use client";

import { cn } from "@/lib/cn";

export type SegmentOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  /** Optional count shown in a small pill after the label. */
  badge?: number | string;
};

type Props<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  /** "sm" for dense contexts (4+ segments, inline period pickers). */
  size?: "sm" | "md";
  ariaLabel?: string;
  className?: string;
};

/**
 * The one segmented control (v1.49.0). Replaces the hand-rolled copies in
 * Transactions, Reports, Categories, Help, Edit Profile, Ledger Symbol, the
 * category sheets, Edit Recurring and the feedback admin. Track:
 * --fill-tertiary; selected segment: --segmented-thumb (raised in dark mode).
 */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  ariaLabel,
  className,
}: Props<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("flex gap-1 rounded-full bg-[var(--fill-tertiary)] p-1", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full transition-all [touch-action:manipulation]",
              size === "sm" ? "min-h-[28px] px-2 py-1 text-[12px]" : "min-h-[32px] px-3 py-1.5 text-[13px]",
              active
                ? "bg-[var(--segmented-thumb)] font-semibold text-[var(--foreground)] shadow-[var(--shadow-card)] ring-1 ring-[var(--ring-subtle)]"
                : "font-medium text-[var(--label-secondary)]"
            )}
          >
            <span className="truncate">{o.label}</span>
            {o.badge !== undefined && (
              <span className="inline-flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-[var(--fill-secondary)] px-1 text-[10px] font-semibold text-[var(--foreground)]">
                {o.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
