"use client";

import { useEffect, useRef, useState } from "react";
import { formatAmount, formatAmountWithSign } from "@/lib/format";
import { ArrowDownLeft, ArrowUpRight, Eye, EyeOff } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/cn";
import SurfaceCard from "@/components/ui/surface-card";
import { maskAmount, togglePrivacyReveal } from "@/lib/privacy";

type Props = {
  balance: number;
  income: number;
  expenses: number;
  currency?: string;
};

function useCountUp(target: number, duration = 600) {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevRef.current;
    const to = target;
    prevRef.current = target;

    // Skip animation for identical values or very small deltas
    if (from === to) return;

    const start = performance.now();
    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (to - from) * eased);
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return display;
}

export default function BalanceCard({ balance, income, expenses, currency = "IDR" }: Props) {
  const t = useT();
  const animatedBalance = useCountUp(balance);
  // Fixed 8-dot mask shared by Total Balance, Income and Expense for a
  // consistent privacy state across all three bento cards.
  const mask = maskAmount(currency);
  return (
    <section className="px-5 pt-4 pb-2 space-y-3">
      {/* Total Balance — full-width bento, same chrome as Income/Expense
          below so all three read as one bento stack. Label + amount both
          centered for hierarchy: it's the headline number. Negative
          balances render in --color-expense with a minus sign; the privacy
          mask state forces foreground via CSS so the mask itself is always
          neutral. */}
      <SurfaceCard className="relative px-4 py-3.5 text-center">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--label-tertiary)]">
          {t("tx.totalBalance")}
        </p>
        <p
          data-privacy-mono
          className={cn(
            "mt-1.5 truncate text-[28px] font-semibold leading-tight tracking-tight tabular-nums",
            balance < 0 ? "text-[var(--color-expense)]" : "text-[var(--foreground)]"
          )}
        >
          <PrivacyAmount
            real={formatAmountWithSign(animatedBalance, currency)}
            hidden={mask}
          />
        </p>
        <PrivacyEyeButton t={t} />
      </SurfaceCard>

      {/* Income + Expense — 2-col bento row, unchanged */}
      <div className="grid grid-cols-2 gap-3">
        <SummaryPill
          label={t("tx.income")}
          value={formatAmount(income, currency)}
          mask={mask}
          icon={<ArrowDownLeft className="h-3.5 w-3.5" strokeWidth={2.5} />}
          tone="income"
        />
        <SummaryPill
          label={t("tx.expenses")}
          value={formatAmount(expenses, currency)}
          mask={mask}
          icon={<ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} />}
          tone="expense"
        />
      </div>
    </section>
  );
}

function PrivacyAmount({ real, hidden }: { real: string; hidden: string }) {
  return (
    <span data-privacy-amount>
      <span data-privacy-real>{real}</span>
      <span data-privacy-hidden aria-hidden="true">{hidden}</span>
    </span>
  );
}

function PrivacyEyeButton({ t }: { t: ReturnType<typeof useT> }) {
  // CSS in app/globals.css hides this button entirely when the user hasn't
  // turned on "Hide amounts on home screen", so it never appears for users
  // who don't use the feature. data-privacy-revealed lives on <html> and is
  // not persisted, so a reload always re-hides per the setting.
  // Icon mapping: masked → crossed-out eye (the standard "hidden" glyph),
  // revealed → plain eye.
  return (
    <button
      type="button"
      data-privacy-eye
      onClick={togglePrivacyReveal}
      aria-label={t("settings.privacy.peek")}
      className="absolute right-2 top-2 h-8 w-8 items-center justify-center rounded-full text-[var(--label-secondary)] active:bg-black/[0.04] transition-colors [touch-action:manipulation]"
    >
      <EyeOff data-eye-icon="hidden"   className="h-[18px] w-[18px]" strokeWidth={2} />
      <Eye    data-eye-icon="revealed" className="h-[18px] w-[18px]" strokeWidth={2} />
    </button>
  );
}

function SummaryPill({
  label,
  value,
  mask,
  icon,
  tone,
}: {
  label: string;
  value: string;
  mask: string;
  icon: React.ReactNode;
  tone: "income" | "expense";
}) {
  const iconTint =
    tone === "income"
      ? "bg-[var(--tint-success-bg)] text-[var(--tint-success-text)]"
      : "bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]";
  return (
    <SurfaceCard className="px-3.5 py-3">
      <div className="flex items-center gap-2">
        <span data-privacy-mono-icon className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${iconTint}`}>
          {icon}
        </span>
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--label-tertiary)]">
          {label}
        </p>
      </div>
      <p className="mt-1.5 truncate text-[17px] font-semibold tracking-tight text-[var(--foreground)] tabular-nums">
        <PrivacyAmount real={value} hidden={mask} />
      </p>
    </SurfaceCard>
  );
}
