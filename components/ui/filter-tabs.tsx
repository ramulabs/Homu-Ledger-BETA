"use client";

import SegmentedControl from "@/components/ui/segmented-control";

type Option<T extends string> = { code: T; label: string; count?: number };

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
};

/**
 * Segmented filter with optional counts (feedback admin, ledger symbol).
 * A thin adapter over SegmentedControl; 4+ options use the dense size so
 * labels like "In progress" don't wrap at phone width.
 */
export default function FilterTabs<T extends string>({ options, value, onChange, className }: Props<T>) {
  return (
    <SegmentedControl
      options={options.map((o) => ({ value: o.code, label: o.label, badge: o.count }))}
      value={value}
      onChange={onChange}
      size={options.length >= 4 ? "sm" : "md"}
      className={className}
    />
  );
}
