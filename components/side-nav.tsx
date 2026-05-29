"use client";

import { usePathname, useRouter } from "next/navigation";
import { Wallet, PieChart, Settings, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { TapLink, TapButton } from "@/components/tap";
import { useT } from "@/lib/i18n/provider";

/**
 * Left-rail navigation for md+ (iPad / desktop) viewports.
 *
 * Hidden on mobile — the BottomNav takes over there. On md+ this rail is
 * sticky on the left, full-height, 240 px wide. It mirrors the three
 * destinations from BottomNav (Transactions, Reports, Settings) plus an
 * Add Transaction button.
 *
 * Active state is derived from usePathname() so it stays in sync with the
 * router. The + button dispatches the same fl:open-add-transaction custom
 * event the BottomNav uses (when already on /transactions) or navigates to
 * /transactions?new=1 otherwise.
 */
export default function SideNav() {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();

  const onTransactions = pathname.startsWith("/transactions");
  const onReports = pathname.startsWith("/reports");
  const onSettings = pathname.startsWith("/settings");

  function openAddTransaction() {
    if (onTransactions) {
      window.dispatchEvent(new CustomEvent("fl:open-add-transaction"));
    } else {
      router.push("/transactions?new=1");
    }
  }

  return (
    <aside
      aria-label="Sidebar navigation"
      className="hidden md:flex md:flex-col w-60 shrink-0 sticky top-0 h-screen border-r border-[var(--separator)] bg-[var(--background)]"
    >
      {/* App brand / logo at top */}
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--foreground)] text-[var(--on-foreground)] text-[18px] font-black tracking-tighter select-none ring-1 ring-[var(--foreground)]/5 shadow-[var(--shadow-card)]">
          H
        </div>
        <span className="text-[18px] font-black tracking-tight text-[var(--foreground)]">Homu</span>
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-1 px-3 pt-2 flex-1">
        <SideNavItem
          href="/transactions"
          label={t("nav.transactions")}
          active={onTransactions}
          icon={<Wallet className="h-[18px] w-[18px]" strokeWidth={onTransactions ? 2.4 : 1.9} />}
        />
        <SideNavItem
          href="/reports"
          label={t("nav.reports")}
          active={onReports}
          icon={<PieChart className="h-[18px] w-[18px]" strokeWidth={onReports ? 2.4 : 1.9} />}
        />
        <SideNavItem
          href="/settings"
          label={t("nav.settings")}
          active={onSettings}
          icon={<Settings className="h-[18px] w-[18px]" strokeWidth={onSettings ? 2.4 : 1.9} />}
        />
      </nav>

      {/* Add button at the bottom of the rail */}
      <div className="px-3 pb-6">
        <TapButton
          onTap={openAddTransaction}
          aria-label={t("tx.add")}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--foreground)] px-4 py-3 text-[14px] font-semibold text-[var(--on-foreground)] shadow-[0_4px_12px_rgba(0,0,0,0.18)] transition-[transform,box-shadow] duration-150 ease-out active:scale-[0.98] active:shadow-[0_2px_6px_rgba(0,0,0,0.14)] [touch-action:manipulation] [-webkit-tap-highlight-color:transparent] focus-visible:outline-none"
        >
          <Plus className="h-[18px] w-[18px]" strokeWidth={2.5} />
          {t("tx.add")}
        </TapButton>
      </div>
    </aside>
  );
}

function SideNavItem({
  href,
  label,
  active,
  icon,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: React.ReactNode;
}) {
  return (
    <TapLink
      href={href}
      aria-label={label}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors duration-150 ease-out [touch-action:manipulation] [-webkit-tap-highlight-color:transparent] focus-visible:outline-none",
        active
          ? "bg-[var(--foreground)]/[0.07] text-[var(--foreground)] font-semibold"
          : "text-[var(--label-tertiary)] hover:bg-[var(--foreground)]/[0.04] hover:text-[var(--foreground)]"
      )}
    >
      {icon}
      <span>{label}</span>
    </TapLink>
  );
}
