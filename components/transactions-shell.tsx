"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import BalanceCard from "@/components/balance-card";
import TransactionList from "@/components/transaction-list";
import AddTransactionSheet from "@/components/add-transaction-sheet";
import AddRecurringSheet from "@/components/add-recurring-sheet";
import RecurringItemList from "@/components/recurring-item-list";
import LedgerSwitcherSheet from "@/components/ledger-switcher-sheet";
import PullToRefresh from "@/components/pull-to-refresh";
import { cn } from "@/lib/cn";
import type { DbTransaction, DbCategory, DbMember, DbHouseholdMembership, DbRecurringItem } from "@/lib/types";

type SubTab = "history" | "recurring";

type Props = {
  transactions: DbTransaction[];
  categories: DbCategory[];
  members: Record<string, DbMember>;
  householdName: string;
  householdId: string;
  householdSymbol: string;
  currency: string;
  balance: number;
  income: number;
  expenses: number;
  currentUser: { initials: string; avatar_color: string };
  memberships: DbHouseholdMembership[];
  recurringItems: DbRecurringItem[];
};

export default function TransactionsShell({
  transactions,
  categories,
  members,
  householdName,
  householdId,
  householdSymbol,
  currency,
  balance,
  income,
  expenses,
  currentUser,
  memberships,
  recurringItems,
}: Props) {
  const [tab, setTab] = useState<SubTab>("history");

  // Transaction sheet
  const [showSheet, setShowSheet] = useState(false);
  const [editingTx, setEditingTx] = useState<DbTransaction | null>(null);

  // Recurring sheet
  const [showRecurringSheet, setShowRecurringSheet] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<DbRecurringItem | null>(null);

  // Ledger switcher
  const [showLedgerSwitcher, setShowLedgerSwitcher] = useState(false);

  // Extra categories added inline (optimistic)
  const [extraCategories, setExtraCategories] = useState<DbCategory[]>([]);
  const allCategories = [
    ...categories,
    ...extraCategories.filter((e) => !categories.find((c) => c.id === e.id)),
  ];

  function openAdd() { setEditingTx(null); setShowSheet(true); }
  function openEdit(tx: DbTransaction) { setEditingTx(tx); setShowSheet(true); }
  function closeSheet() {
    setShowSheet(false);
    setEditingTx(null);
    if (typeof window !== "undefined" && window.location.search.includes("new=1")) {
      window.history.replaceState({}, "", "/transactions");
    }
  }

  function openAddRecurring() { setEditingRecurring(null); setShowRecurringSheet(true); }
  function openEditRecurring(item: DbRecurringItem) { setEditingRecurring(item); setShowRecurringSheet(true); }
  function closeRecurringSheet() { setShowRecurringSheet(false); setEditingRecurring(null); }

  return (
    <>
      <PullToRefresh>
      <div>
        <header className="flex items-center justify-between px-5 pt-4">
          <Link
            href="/settings"
            aria-label="Profile and settings"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-semibold text-white ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.04)] active:scale-95 transition-transform"
            style={{ backgroundColor: currentUser.avatar_color }}
          >
            {currentUser.initials}
          </Link>

          <button
            onClick={() => setShowLedgerSwitcher(true)}
            className="flex flex-col items-center leading-tight active:opacity-70 transition-opacity"
          >
            <h1 className="text-[15px] font-semibold tracking-tight text-[var(--foreground)]">
              {householdSymbol} {householdName}
            </h1>
            <p className="text-[11px] text-[var(--label-secondary)]">Tap to switch ›</p>
          </button>

          <div className="flex items-center gap-2">
            <IconButton ariaLabel="Search">
              <Search className="h-[18px] w-[18px]" strokeWidth={2} />
            </IconButton>
            <IconButton ariaLabel="Filter">
              <SlidersHorizontal className="h-[18px] w-[18px]" strokeWidth={2} />
            </IconButton>
          </div>
        </header>

        <BalanceCard balance={balance} income={income} expenses={expenses} currency={currency} />

        <div className="px-5 pt-4">
          <div className="flex gap-1 rounded-full bg-black/[0.05] p-1">
            <TabButton active={tab === "history"} onClick={() => setTab("history")}>
              History
            </TabButton>
            <TabButton active={tab === "recurring"} onClick={() => setTab("recurring")}>
              Recurring
              {recurringItems.length > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--foreground)]/10 px-1 text-[10px] font-semibold text-[var(--foreground)]">
                  {recurringItems.length}
                </span>
              )}
            </TabButton>
          </div>
        </div>

        <div className="pt-3 pb-24">
          {tab === "history" ? (
            <TransactionList
              transactions={transactions}
              members={members}
              currency={currency}
              onTap={openEdit}
            />
          ) : (
            <RecurringItemList
              items={recurringItems}
              currency={currency}
              onTap={openEditRecurring}
              onAdd={openAddRecurring}
            />
          )}
        </div>
      </div>
      </PullToRefresh>

      <AddTransactionSheet
        open={showSheet}
        onClose={closeSheet}
        categories={allCategories}
        editing={editingTx}
        currency={currency}
        memberships={memberships}
        currentHouseholdId={householdId}
      />

      <AddRecurringSheet
        open={showRecurringSheet}
        onClose={closeRecurringSheet}
        categories={allCategories}
        editing={editingRecurring}
        currency={currency}
        onCategoryAdded={(cat) => setExtraCategories((prev) => [...prev, cat])}
      />

      {showLedgerSwitcher && (
        <LedgerSwitcherSheet
          memberships={memberships}
          currentHouseholdId={householdId}
          onClose={() => setShowLedgerSwitcher(false)}
        />
      )}

      <Suspense>
        <SheetOpener onOpen={openAdd} />
      </Suspense>
    </>
  );
}

function SheetOpener({ onOpen }: { onOpen: () => void }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      onOpen();
      window.history.replaceState({}, "", "/transactions");
    }
  }, [searchParams, onOpen]);
  return null;
}

function IconButton({ children, ariaLabel }: { children: React.ReactNode; ariaLabel: string }) {
  return (
    <button
      aria-label={ariaLabel}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--foreground)] ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.03)] active:scale-95 transition-transform"
    >
      {children}
    </button>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 flex items-center justify-center rounded-full px-3 py-1.5 text-[13px] font-medium transition-all min-h-[32px]",
        active
          ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm"
          : "text-[var(--label-secondary)]"
      )}
    >
      {children}
    </button>
  );
}
