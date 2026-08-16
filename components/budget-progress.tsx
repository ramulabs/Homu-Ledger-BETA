"use client";

// RAM-5 — Reusable budget progress bar.
//
// Pure CSS transitions (no requestAnimationFrame loop) so it pauses
// naturally when a Capacitor WKWebView is backgrounded — see SKILL.md
// "Native iOS/Android compatibility" notes.
//
// State buckets:
//   * neutral  — ratio  < 0.8                  → foreground @ 22% alpha
//   * warning  — 0.8 ≤ ratio < 1.0             → amber-500
//   * over     — ratio ≥ 1.0                   → rose-600

import { cn } from "@/lib/cn";

type Props = {
  /** Spent / amount, can exceed 1.0 when over budget. */
  ratio: number;
  state: "neutral" | "warning" | "over";
  /** Optional class merge for the OUTER track. */
  className?: string;
  /** Visual height in px; defaults to 6. */
  height?: number;
};

const COLOR_BY_STATE: Record<Props["state"], string> = {
  neutral: "var(--foreground)",
  warning: "#f59e0b", // amber-500
  over: "#e11d48",    // rose-600
};

export default function BudgetProgress({ ratio, state, className, height = 6 }: Props) {
  // Visually cap at 100% even when over budget — the over-state colour
  // already screams "you're over"; pushing the fill past 100% would clip.
  const widthPct = Math.min(Math.max(ratio, 0), 1) * 100;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(widthPct)}
      className={cn(
        "relative w-full overflow-hidden rounded-full bg-black/[0.06]",
        className
      )}
      style={{ height }}
    >
      <div
        className="h-full rounded-full transition-[width,background-color] duration-500 ease-out"
        style={{
          width: `${widthPct}%`,
          backgroundColor: COLOR_BY_STATE[state],
          opacity: state === "neutral" ? 0.22 : 1,
        }}
      />
    </div>
  );
}
