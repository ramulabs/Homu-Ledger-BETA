"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { TapLink } from "@/components/tap";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/cn";

type Props = {
  title: React.ReactNode;
  /** Where the back button goes. Omit to use `onBack`, or router.back(). */
  backHref?: string;
  /** Custom back behaviour (multi-step flows step back first). */
  onBack?: () => void;
  /** Element on the right (an action button). The 36px slot is reserved
   *  either way so the title stays centred. */
  right?: React.ReactNode;
  /** false when the header sits inside an already-sticky band (Categories,
   *  where the Expense/Income switch is pinned with it). */
  sticky?: boolean;
  className?: string;
};

/** The round back button used by every page header. */
export const BACK_BUTTON_CLASS =
  "flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--foreground)] ring-1 ring-[var(--ring-default)] shadow-[var(--shadow-card)] active:scale-95 transition-transform [touch-action:manipulation]";

/**
 * Page header for every pushed screen (Settings and its sub-pages, Privacy,
 * account recovery / sign-up). v1.49.0: one component instead of 25
 * hand-rolled copies with five different paddings. Sits flush below the
 * status-bar shield (top: env(safe-area-inset-top)).
 */
export default function StickyHeader({ title, backHref, onBack, right, sticky = true, className }: Props) {
  const router = useRouter();
  const t = useT();
  const back = <ChevronLeft className="h-[20px] w-[20px]" strokeWidth={2.25} />;

  return (
    <header
      className={cn(
        "flex items-center justify-between gap-2 px-5 pt-2 pb-3",
        sticky && "sticky top-[env(safe-area-inset-top)] z-20 bg-[var(--background)]/95 backdrop-blur",
        className
      )}
    >
      {backHref ? (
        <TapLink href={backHref} aria-label={t("common.back")} className={cn(BACK_BUTTON_CLASS, "shrink-0")}>
          {back}
        </TapLink>
      ) : (
        <button type="button" onClick={onBack ?? (() => router.back())} aria-label={t("common.back")} className={cn(BACK_BUTTON_CLASS, "shrink-0")}>
          {back}
        </button>
      )}
      <h1 className="min-w-0 truncate text-center text-[17px] font-semibold tracking-tight text-[var(--foreground)]">{title}</h1>
      <div className="flex h-9 w-9 shrink-0 items-center justify-end">{right ?? null}</div>
    </header>
  );
}
